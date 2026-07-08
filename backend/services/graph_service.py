"""
LangGraph 多 Agent 协同工作流服务
- 基于 StateGraph 编排 Orchestrator → RagBot → Reviewer 工作流
- Orchestrator 分析用户问题属于六大知识领域中的哪个
- RagBot 执行混合检索（BM25 + 向量 + RRF）
- Reviewer 基于领域专属教学风格 + RAG 上下文生成最终回答
"""

import json
from typing import TypedDict, Any, Optional, List

from langgraph.graph import StateGraph, END

from core.config import settings


# 六大知识领域定义 — 与 seed_data.py 的 category 对齐
DOMAINS = {
    "programming": {
        "zh": "编程开发基础",
        "mentor": "你是一位 Python 游戏与工具开发导师，专精变量、控制流、内置容器、函数参数解包、异常捕获等基础概念。在讲解时，请将这些概念与『控制台文字RPG/计算器小工具』的业务场景结合起来讲解，配合简洁的 Python 代码示例。",
    },
    "dsa": {
        "zh": "数据结构与高级特性",
        "mentor": "你是一位 Python 益智游戏逻辑设计导师，专精列表推导式、装饰器、生成器与迭代器协议、垃圾回收与反射等高级特性。在讲解时，请结合『2048网格生成/技能CD限制/无限随机关卡产生』等益智游戏数据引擎逻辑，配合通俗的类比和 Python 代码示例。",
    },
    "organization": {
        "zh": "面向对象与系统架构",
        "mentor": "你是一位 Python 面向对象（OOP）构装设计导师，专精类与实例、继承与多态（MRO算法）、魔术方法、描述符拦截与 slots 空间优化等。请将这些概念与『贪吃蛇蛇身类/扫雷雷区矩阵生成/药水融合』等经典街机游戏结构结合起来讲解，配合 Python 面向对象代码示例。",
    },
    "os": {
        "zh": "并发编程与操作系统",
        "mentor": "你是一位 Python 并发与系统编程导师，专精文件操作、GIL全局锁、多线程与多进程、async/await协程异步编程以及并发线程池。请将这些概念与『多线程打地鼠/多人游戏状态同步/打砖块实时主循环』等动作游戏的实时并发控制场景结合起来讲解。",
    },
    "network": {
        "zh": "网络编程与联机服务",
        "mentor": "你是一位 Python 网络与 Web 编程导师，专精 Socket 套接字通信、HTTP协议请求、FastAPI Web框架、数据序列化等。请将这些概念与『联机对战五子棋/全球积分排行榜/玩家存档打包』等联机服务与网络协议场景结合起来讲解，配合 Python 代码。",
    },
    "database": {
        "zh": "数据工程与持久化",
        "mentor": "你是一位 Python 游戏数据持久化与工程实践导师，专精 SQLite内置数据库、SQLAlchemy ORM框架、pytest单元测试、NumPy/Pandas矩阵与数据分析。请结合『玩家本地存档/核心机制逻辑自测/玩家通关数据统计分析』等工程实践场景进行讲解，配合 SQL 或 Python 数据处理代码示例。",
    },
}


class AgentState(TypedDict, total=False):
    """
    LangGraph 工作流状态定义

    所有节点共享此状态，通过读取和更新字段实现协同。
    total=False 允许字段渐进式填充（不必同时存在所有字段）。
    """

    messages: list                    # 对话历史
    user_id: str                      # 用户ID
    sub_tasks: list                   # Orchestrator 分解的子任务列表
    classified_domain: str            # Orchestrator 分类出的知识领域
    agent_results: dict               # 各 Agent 的中间结果 {"rag": ...}
    final_answer: str                 # 最终聚合结果
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
        Orchestrator 节点：意图分析 + 领域分类

        分析用户消息，判断属于六大知识领域中的哪个，
        或归类为 general（通用对话/闲聊）。

        Returns:
            更新后的状态字段：sub_tasks + classified_domain
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")

        domain = await self._classify_domain(
            user_message, api_key, model, base_url
        )

        return {
            "sub_tasks": [{"domain": domain, "task": user_message}],
            "classified_domain": domain,
        }

    async def _classify_domain(
        self,
        message: str,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
    ) -> str:
        """
        使用 LLM 分析用户意图，分类到六大知识领域或 general

        六大领域与 seed_data.py 的 category 完全对齐：
        - programming: 变量、数据类型、控制流、函数、递归、作用域
        - dsa: 数组、链表、栈、队列、树、图、排序、查找、时间复杂度
        - organization: 二进制、指令系统、CPU、存储层次、总线
        - os: 内存管理、进程线程、调度、并发同步、文件系统
        - network: 分层模型、TCP/UDP、HTTP、路由、DNS
        - database: 数据模型、SQL、索引、事务、范式
        - general: 通用对话、闲聊、非计算机基础问题
        """
        from openai import AsyncOpenAI

        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL
        effective_model = model or settings.DEEPSEEK_MODEL

        if not effective_api_key:
            return "general"

        client = AsyncOpenAI(api_key=effective_api_key, base_url=effective_base_url)

        system_prompt = """你是一个问题分类器。请分析用户的问题，判断它属于以下哪个 Python 游戏或小工具开发领域：

- programming: 终端游戏与工具（变量类型、字符串正则、控制流分支循环、容器列表字典、函数参数解包、异常捕获等）
- dsa: 益智游戏数据（列表推导式、装饰器切面、生成器迭代器、垃圾回收内存管理、反射元编程等）
- organization: 街机游戏设计（类设计、面向对象继承多态MRO、魔术方法重载、描述符属性拦截、__slots__优化等）
- os: 实时动作并发（Pathlib文件IO、GIL锁原理、多线程并发、多进程并行、asyncio协程异步、concurrent并发池等）
- network: 联机对战服务（Socket通信、requests网络请求、FastAPI Web API、WSGI/ASGI、序列化反序列化、虚拟环境venv等）
- database: 数据与工程（SQLite嵌入数据库、SQLAlchemy ORM框架、pytest单元测试、NumPy/Pandas矩阵与数据处理等）
- general: 通用对话、闲聊、或非以上六大领域的问题

请只返回一个 JSON 对象，包含 domain 字段：
{"domain": "programming"}

不要包含其他文本。"""

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

            result = json.loads(content)
            domain = result.get("domain", "general")
            # 验证领域合法性
            if domain in DOMAINS or domain == "general":
                return domain
            return "general"
        except Exception as e:
            print(f"[Orchestrator] 领域分类失败: {e}")
            return "general"

    def route_to_agents(self, state: AgentState) -> str:
        """
        条件路由函数：根据分类领域决定下一个节点

        六大知识领域 → rag_bot（执行混合检索）
        general → reviewer（直接生成通用回答）
        """
        domain = state.get("classified_domain", "general")

        if domain in DOMAINS:
            return "rag_bot"
        return "reviewer"

    async def rag_bot_node(self, state: AgentState) -> dict:
        """
        RagBot 节点：执行混合检索，返回知识库上下文

        调用 rag_service.get_context_for_query()，
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

        供 Reviewer 节点使用的 LLM 调用辅助方法。
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

    async def reviewer_node(self, state: AgentState) -> dict:
        """
        Reviewer 节点：基于领域教学风格 + RAG 上下文生成最终回答

        - 六大领域：使用领域专属导师人设 + 知识库参考材料
        - general：使用通用 AI 助手风格，不注入 RAG 上下文
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")
        agent_results = state.get("agent_results", {})
        domain = state.get("classified_domain", "general")

        # 获取领域教学风格
        domain_info = DOMAINS.get(domain)
        rag_context = ""
        if "rag" in agent_results:
            rag_context = agent_results["rag"].get("context", "")

        # general 领域：直接通用回答
        if domain == "general" or not domain_info:
            general_prompt = "你是一个友好的 AI 助手，请回答用户的问题。"
            general_answer = await self._call_llm(
                general_prompt, user_message, api_key, model, base_url
            )
            return {"final_answer": general_answer or "抱歉，无法生成回答。"}

        # 六大领域：领域导师风格 + RAG 上下文
        system_prompt = domain_info["mentor"]

        if rag_context:
            system_prompt += (
                "\n\n## 知识库参考资料\n"
                f"{rag_context}\n\n"
                "请基于以上参考资料回答用户问题，并在回答中适当引用来源。"
                "如果参考资料中没有直接相关的内容，请基于你的专业知识回答。"
            )

        final_answer = await self._call_llm(
            system_prompt, user_message, api_key, model, base_url
        )

        return {
            "final_answer": final_answer or "抱歉，无法生成回答。",
        }

    def _build_workflow(self):
        """
        构建 LangGraph StateGraph 工作流

        工作流拓扑：
        Orchestrator → (条件路由) → RagBot → Reviewer → END
                                     或
                                   Reviewer → END（general 领域直接跳过检索）

        Returns:
            编译后的 LangGraph 可执行 app
        """
        workflow = StateGraph(AgentState)

        # 添加节点
        workflow.add_node("orchestrator", self.orchestrator_node)
        workflow.add_node("rag_bot", self.rag_bot_node)
        workflow.add_node("reviewer", self.reviewer_node)

        # 设置入口点
        workflow.set_entry_point("orchestrator")

        # 条件路由：六大领域 → rag_bot，general → reviewer
        workflow.add_conditional_edges(
            "orchestrator",
            self.route_to_agents,
            {
                "rag_bot": "rag_bot",
                "reviewer": "reviewer",
            },
        )

        # RagBot 执行后进入 Reviewer 生成最终回答
        workflow.add_edge("rag_bot", "reviewer")

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
            "orchestrator": "意图分析",
            "rag_bot": "知识检索",
            "reviewer": "生成回答",
        }

        # 1. 发送 orchestrator running 事件
        yield {
            "type": "status",
            "node": "orchestrator",
            "label": node_labels["orchestrator"],
            "status": "running",
            "message": "正在分析问题领域...",
        }

        final_answer = ""
        classified_domain = "general"

        # 2. 流式执行，每个节点完成后获取状态更新
        async for chunk in self._app.astream(state, stream_mode="updates"):
            for node_name, state_update in chunk.items():
                if node_name == "orchestrator":
                    classified_domain = state_update.get("classified_domain", "general")
                    sub_tasks = state_update.get("sub_tasks", [])
                    yield {
                        "type": "status",
                        "node": "orchestrator",
                        "label": node_labels["orchestrator"],
                        "status": "done",
                        "data": {
                            "domain": classified_domain,
                            "domain_zh": DOMAINS.get(classified_domain, {}).get("zh", "通用"),
                            "sub_tasks": sub_tasks,
                        },
                    }
                    # 预测下一个节点
                    next_node = self.route_to_agents({"classified_domain": classified_domain})
                    if next_node == "rag_bot":
                        yield {
                            "type": "status",
                            "node": "rag_bot",
                            "label": node_labels["rag_bot"],
                            "status": "running",
                            "message": f"正在检索{DOMAINS.get(classified_domain, {}).get('zh', '')}知识库...",
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

                elif node_name == "rag_bot":
                    agent_results = state_update.get("agent_results", {})
                    yield {
                        "type": "status",
                        "node": "rag_bot",
                        "label": node_labels["rag_bot"],
                        "status": "done",
                        "data": agent_results,
                    }
                    # 下一步是 reviewer
                    yield {
                        "type": "status",
                        "node": "reviewer",
                        "label": node_labels["reviewer"],
                        "status": "running",
                        "message": "正在基于知识库生成回答...",
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
