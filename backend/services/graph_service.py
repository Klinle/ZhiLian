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

    def _build_workflow(self):
        """
        构建 LangGraph StateGraph 工作流

        工作流拓扑：
        Orchestrator → (条件路由) → RagBot / GraphBot / OpsBot → Reviewer → END

        Returns:
            编译后的 LangGraph 可执行 app
        """
        # T6-T11 逐步实现各节点和路由
        workflow = StateGraph(AgentState)
        # 节点和边将在后续任务中添加
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


# 全局实例
graph_service = GraphService()
