"""
LangGraph 多 Agent 协同工作流服务
- 基于 StateGraph 编排 Orchestrator → RagBot → Reviewer 工作流
- Orchestrator 单次 LLM 调用同时分类知识领域（domain）和教学风格（style）
- RagBot 执行混合检索（BM25 + 向量 + RRF）
- Reviewer 组合三段 prompt 生成最终回答：
  1. 风格 prompt（HOW）— 从 Agent 表查询风格导师 system_prompt，手动选择优先于自动分类
  2. 领域 prompt（WHAT）— 从 DOMAINS 字典获取领域专属导师人设
  3. 认知状态（针对谁）— 查询用户知识状态，注入薄弱点和已掌握情况
"""

import json
from typing import TypedDict, Any, Optional, List, Tuple

from langgraph.graph import StateGraph, END

from core.config import settings


# 教学风格 → 中文标签映射
STYLE_ZH_MAP = {
    "humor": "幽默风格",
    "academic": "学术风格",
    "coach": "实战风格",
    "general": "通用风格",
}

# 教学风格 → Agent role_type 映射（与 agent_service.STYLE_ROLE_MAP 保持一致）
STYLE_ROLE_MAP = {
    "humor": "humor_mentor",
    "academic": "academic_mentor",
    "coach": "coach_mentor",
    "general": None,
}

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
    classified_style: str             # Orchestrator 分类出的教学风格
    agent_id: str                     # 用户手动选择的导师 ID（humor/academic/coach 或 UUID）
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
        Orchestrator 节点：意图分析 + 领域分类 + 风格分类

        分析用户消息，判断属于六大知识领域中的哪个，
        以及最适合的教学风格，或归类为 general。

        Returns:
            更新后的状态字段：sub_tasks + classified_domain + classified_style
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")

        domain, style = await self._classify_domain_and_style(
            user_message, api_key, model, base_url
        )

        return {
            "sub_tasks": [{"domain": domain, "style": style, "task": user_message}],
            "classified_domain": domain,
            "classified_style": style,
        }

    async def _classify_domain_and_style(
        self,
        message: str,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        单次 LLM 调用同时分类知识领域和教学风格。

        Returns:
            (domain, style) — domain 为六大领域或 general，style 为 humor/academic/coach/general
        """

        from openai import AsyncOpenAI

        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL
        effective_model = model or settings.DEEPSEEK_MODEL

        if not effective_api_key:
            return "general", "general"

        client = AsyncOpenAI(api_key=effective_api_key, base_url=effective_base_url)

        system_prompt = """你是一个双重分类器。请分析用户的问题，同时判断：

1. 知识领域（domain）— 属于以下哪个领域：
- programming: 终端游戏与工具（变量类型、字符串正则、控制流分支循环、容器列表字典、函数参数解包、异常捕获等）
- dsa: 益智游戏数据（列表推导式、装饰器切面、生成器迭代器、垃圾回收内存管理、反射元编程等）
- organization: 街机游戏设计（类设计、面向对象继承多态MRO、魔术方法重载、描述符属性拦截、__slots__优化等）
- os: 实时动作并发（Pathlib文件IO、GIL锁原理、多线程并发、多进程并行、asyncio协程异步、concurrent并发池等）
- network: 联机对战服务（Socket通信、requests网络请求、FastAPI Web API、WSGI/ASGI、序列化反序列化、虚拟环境venv等）
- database: 数据与工程（SQLite嵌入数据库、SQLAlchemy ORM框架、pytest单元测试、NumPy/Pandas矩阵与数据处理等）
- general: 通用对话、闲聊、或非以上六大领域的问题

2. 教学风格（style）— 用户当前最适合哪种教学风格：
- humor: 基础概念入门、通俗理解、初次接触（例如："什么是装饰器" "讲讲Python的列表"）
- academic: 深度原理、底层机制、探究设计哲学（例如："GIL锁是怎么工作的" "CPython如何进行垃圾回收"）
- coach: 代码实现、实战工程应用、面试准备（例如："写一个FastAPI接口" "给我个装饰器限流代码"）
- general: 闲聊、问候、或不易判断

请只返回一个 JSON 对象：
{"domain": "programming", "style": "humor"}

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
            style = result.get("style", "general")
            # 验证合法性
            if domain not in DOMAINS and domain != "general":
                domain = "general"
            if style not in STYLE_ROLE_MAP:
                style = "general"
            return domain, style
        except Exception as e:
            print(f"[Orchestrator] 领域+风格分类失败: {e}")
            return "general", "general"

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
        Reviewer 节点：组合教学风格 + 领域知识 + RAG 上下文 + 认知状态，生成最终回答

        三段组合：
        - 风格 prompt（HOW）— 从 Agent 表查询，手动选择优先于自动分类
        - 领域 prompt（WHAT）— 从 DOMAINS 字典获取
        - 认知状态（针对谁）— 从用户知识状态表查询薄弱点和已掌握点
        """
        user_message = state.get("user_message", "")
        api_key = state.get("api_key", "")
        model = state.get("model", "")
        base_url = state.get("base_url")
        agent_results = state.get("agent_results", {})
        domain = state.get("classified_domain", "general")
        style = state.get("classified_style", "general")
        agent_id = state.get("agent_id")
        user_id = state.get("user_id", "")
        session = state.get("session")

        # 获取 RAG 上下文
        rag_context = ""
        if "rag" in agent_results:
            rag_context = agent_results["rag"].get("context", "")

        # 1. 确定教学风格 prompt（手动选择优先于自动分类）
        style_prompt = ""
        if agent_id and agent_id != "auto":
            style_prompt = await self._fetch_style_prompt(session, agent_id)
        elif style and style != "general":
            style_prompt = await self._fetch_style_prompt(session, style)

        # 2. 获取领域 prompt（WHAT）
        domain_info = DOMAINS.get(domain)
        domain_prompt = domain_info["mentor"] if domain_info else ""

        # 3. 组合 system_prompt：风格（HOW）+ 领域（WHAT）+ RAG 上下文
        parts = []
        if style_prompt:
            parts.append(style_prompt)
        if domain_prompt:
            parts.append(f"## 当前教学领域\n{domain_prompt}")
        else:
            # general 领域且无风格 prompt时的保底
            if not style_prompt:
                parts.append("你是一个友好的 AI 助手，请回答用户的问题。")
        if rag_context:
            parts.append(
                f"## 知识库参考资料\n{rag_context}\n\n"
                "请基于以上参考资料回答用户问题，并在回答中适当引用来源。"
                "如果参考资料中没有直接相关的内容，请基于你的专业知识回答。"
            )

        system_prompt = "\n\n".join(parts)

        # 4. 注入用户认知状态（针对谁）
        if user_id and session:
            system_prompt = await self._inject_cognitive_state(
                session, user_id, system_prompt
            )

        # 5. 调用 LLM 生成最终回答
        final_answer = await self._call_llm(
            system_prompt, user_message, api_key, model, base_url
        )

        return {
            "final_answer": final_answer or "抱歉，无法生成回答。",
        }

    async def _fetch_style_prompt(
        self, session: Any, agent_id: str
    ) -> str:
        """
        从 Agent 表查询风格导师的 system_prompt

        Args:
            session: 数据库会话
            agent_id: 可能是风格关键字（humor/academic/coach）或 UUID

        Returns:
            风格导师的 system_prompt，查询失败时返回空字符串
        """
        if not session:
            return ""

        from models.database import Agent
        from sqlalchemy import select

        try:
            # 风格关键字 → role_type 映射
            if agent_id in STYLE_ROLE_MAP and STYLE_ROLE_MAP[agent_id]:
                role_type = STYLE_ROLE_MAP[agent_id]
                stmt = select(Agent).where(
                    Agent.role_type == role_type,
                    Agent.is_active == 1,
                )
            else:
                # 尝试作为 UUID 查询
                from uuid import UUID
                stmt = select(Agent).where(
                    Agent.id == UUID(agent_id),
                    Agent.is_active == 1,
                )

            result = await session.execute(stmt)
            agent = result.scalars().first()
            if agent:
                return agent.system_prompt or ""
        except Exception as e:
            print(f"[Reviewer] 查询风格导师失败: {e}")

        return ""

    async def _inject_cognitive_state(
        self, session: Any, user_id: str, base_prompt: str
    ) -> str:
        """
        查询用户知识状态，将薄弱点与已掌握情况注入 system_prompt，实现个性化教学。

        逻辑与 agent_service.AgentService._inject_cognitive_state 保持一致，
        避免循环依赖而独立实现。
        """
        from uuid import UUID
        from sqlalchemy import select
        from models.database import KnowledgeNode, UserKnowledgeState

        try:
            uid = UUID(user_id)
        except (ValueError, AttributeError):
            return base_prompt

        # 关联查询用户的知识状态与节点
        stmt = (
            select(UserKnowledgeState, KnowledgeNode)
            .join(KnowledgeNode, UserKnowledgeState.node_id == KnowledgeNode.id)
            .where(UserKnowledgeState.user_id == uid)
        )
        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return base_prompt  # 新用户无状态，用原始 prompt

        lighted_names: list[str] = []
        weak_names: list[str] = []
        for state_row, node in rows:
            if state_row.is_lighted:
                lighted_names.append(node.name)
            elif state_row.proficiency < 0.5:
                weak_names.append(node.name)

        cognitive = "\n\n## 当前学员知识掌握情况（个性化教学依据）\n"
        cognitive += f"- 已点亮（已掌握）知识点: {len(lighted_names)} 个"
        if lighted_names:
            cognitive += f"（{', '.join(lighted_names[:8])}）"
        cognitive += "\n"
        cognitive += f"- 薄弱知识点: {len(weak_names)} 个"
        if weak_names:
            cognitive += f"（{', '.join(weak_names[:8])}）"
        cognitive += (
            "\n\n## 个性化教学策略\n"
            "- 针对薄弱知识点：多结合实际案例，深入剖析核心设计与易错细节，放慢讲解节奏并鼓励提问\n"
            "- 针对已掌握的概念：减少赘述，引导探讨底层性能优化或更高级的进阶用法\n"
            "- 在讲解新模块时，适时与已掌握或薄弱的知识点进行横向关联，帮助构建完整的技能网络"
        )

        return base_prompt + cognitive

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
        classified_style = "general"

        # 2. 流式执行，每个节点完成后获取状态更新
        async for chunk in self._app.astream(state, stream_mode="updates"):
            for node_name, state_update in chunk.items():
                if node_name == "orchestrator":
                    classified_domain = state_update.get("classified_domain", "general")
                    classified_style = state_update.get("classified_style", "general")
                    sub_tasks = state_update.get("sub_tasks", [])
                    yield {
                        "type": "status",
                        "node": "orchestrator",
                        "label": node_labels["orchestrator"],
                        "status": "done",
                        "data": {
                            "domain": classified_domain,
                            "domain_zh": DOMAINS.get(classified_domain, {}).get("zh", "通用"),
                            "style": classified_style,
                            "style_zh": STYLE_ZH_MAP.get(classified_style, "通用"),
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
