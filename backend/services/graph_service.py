"""
LangGraph 多 Agent 协同工作流服务
- 基于 StateGraph 编排 Orchestrator → RagBot/GraphBot/OpsBot → Reviewer 工作流
- 支持任务分解、中间结果传递、交叉审查
"""

import json
from typing import TypedDict, Any, Optional, List

from langgraph.graph import StateGraph, END

from core.config import settings


class AgentState(TypedDict, total=False):
    """
    LangGraph 工作流状态定义

    所有节点共享此状态，通过读取和更新字段实现协同。
    total=False 允许字段渐进式填充（不必同时存在所有字段）。
    """

    messages: list                    # 对话历史
    user_id: str                      # 用户ID
    user_cognitive_state: dict        # 用户认知画像（P1阶段填充）
    sub_tasks: list                   # Orchestrator 分解的子任务列表
    agent_results: dict               # 各 Agent 的中间结果 {"rag": ..., "langgraph": ...}
    final_answer: str                 # 最终聚合结果
    needs_review: bool                # 是否需要交叉审查
    api_key: str                      # LLM API Key
    model: str                        # 模型名
    base_url: Optional[str]           # 自定义 API 地址
    session: Any                      # 数据库会话（RagBot 检索需要）
    user_message: str                 # 当前用户消息


class GraphService:
    """LangGraph 多 Agent 协同工作流服务"""

    def __init__(self):
        self._app = None

    async def orchestrator_node(self, state: AgentState) -> dict:
        """
        Orchestrator 节点：任务分解 + 路由决策

        分析用户消息，决定哪些 Agent 需要参与（可能多选），
        并分解子任务。

        Returns:
            更新后的状态字段：sub_tasks + needs_review
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")

        sub_tasks = await self._classify_and_decompose(
            user_message, api_key, model, base_url
        )

        # 多个子任务需要交叉审查
        needs_review = len(sub_tasks) > 1

        return {
            "sub_tasks": sub_tasks,
            "needs_review": needs_review,
        }

    async def _classify_and_decompose(
        self,
        message: str,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
    ) -> List[dict]:
        """
        使用 LLM 分析用户意图并分解子任务

        返回子任务列表，每个子任务包含 domain 和 task。
        多领域问题会分解为多个子任务（多选）。
        """
        from openai import AsyncOpenAI

        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL
        effective_model = model or settings.DEEPSEEK_MODEL

        if not effective_api_key:
            return [{"domain": "general", "task": message}]

        client = AsyncOpenAI(api_key=effective_api_key, base_url=effective_base_url)

        system_prompt = """你是一个任务分解器。请分析用户的消息，判断需要哪些领域的 Agent 协同处理。

可能的领域：
- rag: 涉及 RAG（检索增强生成）、文档分块、向量检索、Embedding、混合检索等
- langgraph: 涉及 LangGraph、状态机、多智能体、节点、边、条件路由等
- llmops: 涉及 LLMOps、模型评测、监控、部署、容器化等
- general: 通用对话、闲聊、编程问题

一条用户消息可能涉及多个领域（多选），也可能只涉及一个领域。

请只返回一个 JSON 数组，每个元素包含 domain 和 task：
[{"domain": "rag", "task": "子任务描述"}, ...]

如果只涉及一个领域，返回单个元素的数组。"""

        try:
            response = await client.chat.completions.create(
                model=effective_model,
                temperature=0.1,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message[:500]},
                ],
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()

            sub_tasks = json.loads(content)
            if isinstance(sub_tasks, list) and sub_tasks:
                return sub_tasks
            return [{"domain": "general", "task": message}]
        except Exception as e:
            print(f"[Orchestrator] 任务分解失败: {e}")
            return [{"domain": "general", "task": message}]

    def route_to_agents(self, state: AgentState) -> str:
        """
        条件路由函数：根据 sub_tasks 决定下一个节点

        按优先级返回第一个匹配的 Agent 节点名称。
        多 Agent 并行将在 P2 阶段完善。
        """
        sub_tasks = state.get("sub_tasks", [])

        # 领域到节点名称的映射
        node_map = {
            "rag": "rag_bot",
            "langgraph": "graph_bot",
            "llmops": "ops_bot",
        }

        for task in sub_tasks:
            domain = task.get("domain", "general")
            node = node_map.get(domain)
            if node:
                return node

        # 无匹配领域时直接到 Reviewer
        return "reviewer"

    async def rag_bot_node(self, state: AgentState) -> dict:
        """
        RagBot 节点：执行混合检索，返回知识库上下文

        调用现有 rag_service.get_context_for_query()，
        将检索结果存入 agent_results["rag"]。
        """
        from services.rag_service import rag_service

        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        base_url = state.get("base_url")
        session = state.get("session")
        user_id = state.get("user_id", "")

        agent_results = state.get("agent_results", {})

        if not session:
            agent_results["rag"] = {"context": "", "error": "无数据库会话"}
            return {"agent_results": agent_results}

        try:
            rag_context = await rag_service.get_context_for_query(
                user_message,
                api_key,
                session,
                provider="openai",
                base_url=base_url,
                use_local=False,
                user_id=user_id,
            )
            agent_results["rag"] = {"context": rag_context or "", "error": None}
        except Exception as e:
            agent_results["rag"] = {"context": "", "error": str(e)}

        return {"agent_results": agent_results}

    async def _call_llm(
        self,
        system_prompt: str,
        user_message: str,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
    ) -> str:
        """
        调用 LLM 生成回复（非流式）

        供 GraphBot / OpsBot / Reviewer 等节点共用的 LLM 调用辅助方法。
        """
        from openai import AsyncOpenAI

        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL
        effective_model = model or settings.DEEPSEEK_MODEL

        if not effective_api_key:
            return ""

        client = AsyncOpenAI(api_key=effective_api_key, base_url=effective_base_url)

        try:
            response = await client.chat.completions.create(
                model=effective_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            print(f"[LLM] 调用失败: {e}")
            return ""

    async def graph_bot_node(self, state: AgentState) -> dict:
        """
        GraphBot 节点：LangGraph 教学辅导

        基于用户消息和 RagBot 的中间结果（如有），
        使用 LLM 生成 LangGraph 领域的教学内容。
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")
        agent_results = state.get("agent_results", {})

        # 读取 RagBot 的中间结果（如有）
        rag_context = ""
        if "rag" in agent_results:
            rag_context = agent_results["rag"].get("context", "")

        system_prompt = (
            "你是一位 LangGraph 教学导师，专精状态机设计、多智能体编排、"
            "条件路由、状态持久化等 LangGraph 核心概念。"
            "请用清晰易懂的方式讲解，配合代码示例。"
        )

        # 如果有 RAG 上下文，注入到 prompt 中
        if rag_context:
            system_prompt += (
                "\n\n## 知识库参考资料\n"
                f"{rag_context}"
            )

        content = await self._call_llm(
            system_prompt, user_message, api_key, model, base_url
        )

        agent_results["langgraph"] = {"content": content, "error": None if content else "LLM 返回空内容"}
        return {"agent_results": agent_results}

    async def ops_bot_node(self, state: AgentState) -> dict:
        """
        OpsBot 节点：LLMOps 评测运维辅导

        基于用户消息和其他 Agent 的中间结果，
        使用 LLM 生成 LLMOps 领域的运维/评测内容。
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")
        agent_results = state.get("agent_results", {})

        # 读取 RagBot 的中间结果（如有）
        rag_context = ""
        if "rag" in agent_results:
            rag_context = agent_results["rag"].get("context", "")

        system_prompt = (
            "你是一位 LLMOps 运维导师，专精模型评测、监控、部署、"
            "容器化、性能测试、A/B 测试等 LLMOps 核心实践。"
            "请用清晰易懂的方式讲解，配合实际操作步骤。"
        )

        # 如果有 RAG 上下文，注入到 prompt 中
        if rag_context:
            system_prompt += (
                "\n\n## 知识库参考资料\n"
                f"{rag_context}"
            )

        content = await self._call_llm(
            system_prompt, user_message, api_key, model, base_url
        )

        agent_results["llmops"] = {"content": content, "error": None if content else "LLM 返回空内容"}
        return {"agent_results": agent_results}

    async def reviewer_node(self, state: AgentState) -> dict:
        """
        Reviewer 节点：交叉审查 + 最终聚合

        收集所有 Agent 的中间结果，使用 LLM 检查一致性，
        聚合生成最终输出。
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")
        agent_results = state.get("agent_results", {})
        needs_review = state.get("needs_review", False)

        # 收集所有 Agent 的有效结果
        results_parts: list[str] = []
        for agent_name, result in agent_results.items():
            if isinstance(result, dict):
                content = result.get("content", "") or result.get("context", "")
                if content:
                    results_parts.append(f"### {agent_name} 的结果\n{content}")

        # 无任何结果时（general 领域），直接生成通用回答
        if not results_parts:
            general_prompt = "你是一个友好的 AI 助手，请回答用户的问题。"
            general_answer = await self._call_llm(
                general_prompt, user_message, api_key, model, base_url
            )
            return {"final_answer": general_answer or "抱歉，无法生成回答。", "needs_review": False}

        results_text = "\n\n".join(results_parts)

        # 根据是否需要交叉审查构建不同的 system_prompt
        if needs_review:
            system_prompt = (
                "你是一个审查者和聚合器。以下是多个 Agent 的回答结果，请：\n"
                "1. 检查各结果之间的一致性\n"
                "2. 去除矛盾或重复的内容\n"
                "3. 聚合成一个连贯、完整的最终回答\n"
                "4. 保持原有的技术准确性和教学价值\n\n"
                f"## 用户原始问题\n{user_message}\n\n"
                f"## 各 Agent 的结果\n{results_text}\n\n"
                "请直接输出聚合后的最终回答，不要包含审查过程。"
            )
        else:
            # 单个 Agent 结果，直接作为最终答案
            system_prompt = (
                "请基于以下内容回答用户的问题。\n\n"
                f"## 用户问题\n{user_message}\n\n"
                f"## 参考内容\n{results_text}\n\n"
                "请直接输出回答。"
            )

        final_answer = await self._call_llm(
            system_prompt, user_message, api_key, model, base_url
        )

        return {
            "final_answer": final_answer or "抱歉，无法生成回答。",
            "needs_review": False,
        }

    def _build_workflow(self):
        """
        构建 LangGraph StateGraph 工作流

        工作流拓扑：
        Orchestrator → (条件路由) → RagBot / GraphBot / OpsBot → Reviewer → END

        Returns:
            编译后的 LangGraph 可执行 app
        """
        workflow = StateGraph(AgentState)

        # 添加节点
        workflow.add_node("orchestrator", self.orchestrator_node)
        workflow.add_node("rag_bot", self.rag_bot_node)
        workflow.add_node("graph_bot", self.graph_bot_node)
        workflow.add_node("ops_bot", self.ops_bot_node)
        workflow.add_node("reviewer", self.reviewer_node)

        # 设置入口点
        workflow.set_entry_point("orchestrator")

        # 条件路由：Orchestrator 根据任务分解结果决定下一个 Agent
        workflow.add_conditional_edges(
            "orchestrator",
            self.route_to_agents,
            {
                "rag_bot": "rag_bot",
                "graph_bot": "graph_bot",
                "ops_bot": "ops_bot",
                "reviewer": "reviewer",
            },
        )

        # 各 Agent 执行后统一进入 Reviewer 审查
        workflow.add_edge("rag_bot", "reviewer")
        workflow.add_edge("graph_bot", "reviewer")
        workflow.add_edge("ops_bot", "reviewer")

        # Reviewer → END
        workflow.add_edge("reviewer", END)

        return workflow.compile()

    async def run(self, state: AgentState) -> AgentState:
        """
        执行多 Agent 协同工作流

        Args:
            state: 初始状态（包含 user_message, api_key, model 等）

        Returns:
            最终状态（包含 final_answer）
        """
        if self._app is None:
            self._app = self._build_workflow()
        result = await self._app.ainvoke(state)
        return result

    async def run_stream(self, state: AgentState):
        """
        流式执行多 Agent 工作流，yield 事件字典。

        用于 SSE 端点，前端可实时展示各节点工作状态和最终回答。

        事件类型：
        - status: {type, node, label, status, message?, data?}
        - content: {type, text}
        - done: {type}
        """
        if self._app is None:
            self._app = self._build_workflow()

        # 节点名称到中文标签的映射
        node_labels = {
            "orchestrator": "任务分析",
            "rag_bot": "知识检索",
            "graph_bot": "LangGraph 教学",
            "ops_bot": "LLMOps 运维",
            "reviewer": "聚合审查",
        }

        # 1. 发送 orchestrator running 事件
        yield {
            "type": "status",
            "node": "orchestrator",
            "label": node_labels["orchestrator"],
            "status": "running",
            "message": "正在分析问题...",
        }

        final_answer = ""
        needs_review = False

        # 2. 流式执行，每个节点完成后获取状态更新
        async for chunk in self._app.astream(state, stream_mode="updates"):
            for node_name, state_update in chunk.items():
                if node_name == "orchestrator":
                    sub_tasks = state_update.get("sub_tasks", [])
                    needs_review = state_update.get("needs_review", False)
                    yield {
                        "type": "status",
                        "node": "orchestrator",
                        "label": node_labels["orchestrator"],
                        "status": "done",
                        "data": {
                            "sub_tasks": sub_tasks,
                            "needs_review": needs_review,
                        },
                    }
                    # 预测下一个节点
                    next_node = self.route_to_agents({"sub_tasks": sub_tasks})
                    if next_node != "reviewer":
                        yield {
                            "type": "status",
                            "node": next_node,
                            "label": node_labels.get(next_node, next_node),
                            "status": "running",
                            "message": "正在处理...",
                        }
                    else:
                        # general 域直接到 reviewer
                        yield {
                            "type": "status",
                            "node": "reviewer",
                            "label": node_labels["reviewer"],
                            "status": "running",
                            "message": "正在生成回答...",
                        }

                elif node_name in ("rag_bot", "graph_bot", "ops_bot"):
                    agent_results = state_update.get("agent_results", {})
                    yield {
                        "type": "status",
                        "node": node_name,
                        "label": node_labels.get(node_name, node_name),
                        "status": "done",
                        "data": agent_results,
                    }
                    # 下一步是 reviewer
                    yield {
                        "type": "status",
                        "node": "reviewer",
                        "label": node_labels["reviewer"],
                        "status": "running",
                        "message": "正在聚合审查..." if needs_review else "正在生成回答...",
                    }

                elif node_name == "reviewer":
                    final_answer = state_update.get("final_answer", "")
                    yield {
                        "type": "status",
                        "node": "reviewer",
                        "label": node_labels["reviewer"],
                        "status": "done",
                    }

        # 3. 将最终回答分块 yield（假流式，保持逐字输出体验）
        if final_answer:
            chunk_size = 20
            for i in range(0, len(final_answer), chunk_size):
                yield {"type": "content", "text": final_answer[i:i + chunk_size]}

        # 4. 发送完成事件
        yield {"type": "done"}


# 全局实例
graph_service = GraphService()
