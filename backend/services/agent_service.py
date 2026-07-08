"""
Agent 自动路由服务 — 按学习场景路由风格导师（HumorBot / ProfBot / CoachBot）
- 根据用户消息判断学习场景（概念入门 / 深度原理 / 代码实操），路由对应风格导师
- 注入用户认知状态（薄弱点、已掌握），让导师"认识"用户、个性化教学
- 若用户手动指定 agent_id，则跳过自动路由
"""

from typing import Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from models.database import Agent, KnowledgeNode, UserKnowledgeState
from core.config import settings


# 学习场景 → role_type 映射（按学习场景路由风格导师）
STYLE_ROLE_MAP = {
    "humor": "humor_mentor",       # 幽默大师：概念入门、轻松理解
    "academic": "academic_mentor", # 严谨教授：深度原理、体系构建
    "coach": "coach_mentor",       # 实战教练：代码实操、面试准备
    "general": None,               # 通用：不使用特定 Agent
}


class AgentService:
    async def route_agent(
        self,
        message: str,
        session: AsyncSession,
        api_key: str = "",
        model: str = "",
        base_url: str = None,
        agent_id: str = None,
        user_id: str = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        根据用户消息自动路由到合适的学习风格导师，并注入用户认知状态。

        Args:
            message: 用户消息
            session: 数据库会话
            api_key: LLM API Key
            model: LLM 模型名
            base_url: 自定义 API 地址
            agent_id: 手动指定的 Agent ID 或场景关键字（humor/academic/coach）
            user_id: 当前用户 ID（用于注入认知状态）

        Returns:
            (system_prompt, agent_name) — system_prompt 已含个性化认知注入
        """
        agent: Optional[Agent] = None

        # 1. 手动指定：支持场景关键字 (humor/academic/coach) 或 UUID
        if agent_id:
            if agent_id in STYLE_ROLE_MAP and STYLE_ROLE_MAP[agent_id]:
                stmt = select(Agent).where(
                    Agent.role_type == STYLE_ROLE_MAP[agent_id],
                    Agent.is_active == 1,
                )
                result = await session.execute(stmt)
                agent = result.scalars().first()
            else:
                # 尝试作为 UUID 查询
                prompt, name = await self._get_agent_by_id(session, agent_id)
                if prompt:
                    # 手动指定也注入认知状态
                    if user_id:
                        prompt = await self._inject_cognitive_state(session, user_id, prompt)
                    return prompt, name
                return None, None

        # 2. 自动路由：LLM 分类学习风格
        if agent is None:
            style = await self._classify_intent(message, api_key, model, base_url)
            if not style or style == "general":
                return None, None
            role_type = STYLE_ROLE_MAP.get(style)
            if not role_type:
                return None, None
            stmt = select(Agent).where(
                Agent.role_type == role_type,
                Agent.is_active == 1,
            )
            result = await session.execute(stmt)
            agent = result.scalars().first()

        if not agent:
            return None, None

        # 3. 注入用户认知状态（薄弱点、已掌握），让导师"认识"用户
        system_prompt = agent.system_prompt
        if user_id:
            system_prompt = await self._inject_cognitive_state(session, user_id, system_prompt)

        return system_prompt, agent.name

    async def _inject_cognitive_state(
        self, session: AsyncSession, user_id: str, base_prompt: str
    ) -> str:
        """查询用户知识状态，将薄弱点与已掌握情况注入 system_prompt，实现个性化教学。"""
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
        for state, node in rows:
            if state.is_lighted:
                lighted_names.append(node.name)
            elif state.proficiency < 0.5:
                weak_names.append(node.name)

        cognitive = "\n\n## 当前学员 Python 技能树掌握情况（个性化教学依据）\n"
        cognitive += f"- 已点亮（已掌握）Python 知识点: {len(lighted_names)} 个"
        if lighted_names:
            cognitive += f"（{', '.join(lighted_names[:8])}）"
        cognitive += "\n"
        cognitive += f"- 薄弱 Python 知识点: {len(weak_names)} 个"
        if weak_names:
            cognitive += f"（{', '.join(weak_names[:8])}）"
        cognitive += "\n\n## 个性化 Python 教学策略\n- 针对薄弱知识点：多结合实际案例，深入剖析 Python 特有的设计与易错细节，放慢讲解节奏并鼓励提问\n- 针对已掌握的 Python 概念：减少赘述，引导其探讨底层性能优化（如 __slots__、生成器节省内存等）或更高级的 Pythonic 进阶用法\n- 在讲解新模块时，适时与已掌握或薄弱的 Python 知识点进行横向关联，帮助其构建完整的 Python 核心技能网络"

        return base_prompt + cognitive

    async def _get_agent_by_id(
        self, session: AsyncSession, agent_id: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """根据 ID 获取 Agent 的 system_prompt"""
        from uuid import UUID

        try:
            stmt = select(Agent).where(
                Agent.id == UUID(agent_id),
                Agent.is_active == 1,
            )
            result = await session.execute(stmt)
            agent = result.scalars().first()
            if agent:
                return agent.system_prompt, agent.name
        except Exception:
            pass
        return None, None

    async def _classify_intent(
        self,
        message: str,
        api_key: str,
        model: str,
        base_url: str = None,
    ) -> str:
        """
        使用快速 LLM 调用进行意图分类。
        返回 'story' / 'practice' / 'quiz' / 'general'
        """
        from openai import AsyncOpenAI

        # 使用 DeepSeek 默认配置（系统级快速分类）
        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL
        effective_model = model or settings.DEEPSEEK_MODEL

        if not effective_api_key:
            return "general"

        client = AsyncOpenAI(api_key=effective_api_key, base_url=effective_base_url)

        system_prompt = """你是一个 Python 学习场景分类器。请根据用户的消息，判断用户当前最适合哪种教学风格的 Python 导师：
- humor: Python 基础概念入门、通俗理解、初次接触（例如："什么是装饰器" "讲讲Python的列表" "为什么Python变量不用声明类型"）
- academic: Python 深度原理、底层机制、探究设计哲学（例如："Python的GIL锁是怎么工作的" "CPython是如何进行垃圾回收的" "详述Python的MRO多继承顺序机制" "Python协程底层如何保存状态"）
- coach: Python 代码实现、实战工程应用、面试准备、重构调优（例如："写一个FastAPI的接口" "如何用pytest做单元测试" "给我写个装饰器限流的代码示例" "Python经典面试题" "帮我重构这段Python代码"）
- general: 闲聊、问候、或不易判断的通用对话

请只返回一个 JSON 对象：{"domain": "humor|academic|coach|general"}"""

        try:
            response = await client.chat.completions.create(
                model=effective_model,
                temperature=0.1,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message[:500]},  # 截断防止过长
                ],
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()

            data = json.loads(content)
            domain = data.get("domain", "general")
            if domain in STYLE_ROLE_MAP:
                return domain
            return "general"
        except Exception as e:
            print(f"[Agent Router] Intent classification failed: {e}")
            return "general"


agent_service = AgentService()
