"""
Agent 自动路由服务
- 根据用户消息意图，自动选择最合适的 Agent（RagBot / GraphBot / OpsBot）
- 使用快速 LLM 调用进行意图分类，返回 JSON {"domain": "rag|langgraph|llmops|general"}
- 若用户手动指定 agent_id，则跳过自动路由
"""

from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from models.database import Agent
from core.config import settings


# 域名 → role_type 映射
DOMAIN_ROLE_MAP = {
    "rag": "rag_mentor",
    "langgraph": "langgraph_mentor",
    "llmops": "llmops_mentor",
    "general": None,  # 通用：不使用特定 Agent
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
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        根据用户消息自动路由到合适的 Agent。

        Args:
            message: 用户消息
            session: 数据库会话
            api_key: LLM API Key
            model: LLM 模型名
            base_url: 自定义 API 地址
            agent_id: 手动指定的 Agent ID（若提供则跳过自动路由）

        Returns:
            (system_prompt, agent_name) — 若未匹配到 Agent 则返回 (None, None)
        """
        # 1. 如果手动指定了 agent_id，尝试查询
        if agent_id:
            # agent_id 可能是域名关键字 (rag/langgraph/llmops) 或 UUID
            if agent_id in DOMAIN_ROLE_MAP and DOMAIN_ROLE_MAP[agent_id]:
                # 域名关键字 → 按 role_type 查询
                role_type = DOMAIN_ROLE_MAP[agent_id]
                stmt = select(Agent).where(
                    Agent.role_type == role_type,
                    Agent.is_active == 1,
                )
                result = await session.execute(stmt)
                agent = result.scalars().first()
                if agent:
                    return agent.system_prompt, agent.name
            else:
                # 尝试作为 UUID 查询
                return await self._get_agent_by_id(session, agent_id)

        # 2. 使用 LLM 进行意图分类
        domain = await self._classify_intent(message, api_key, model, base_url)

        if not domain or domain == "general":
            return None, None

        # 3. 根据域名查找对应的 Agent
        role_type = DOMAIN_ROLE_MAP.get(domain)
        if not role_type:
            return None, None

        stmt = select(Agent).where(
            Agent.role_type == role_type,
            Agent.is_active == 1,
        )
        result = await session.execute(stmt)
        agent = result.scalars().first()

        if agent:
            return agent.system_prompt, agent.name

        return None, None

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
        返回 'rag' / 'langgraph' / 'llmops' / 'general'
        """
        from openai import AsyncOpenAI

        # 使用 DeepSeek 默认配置（系统级快速分类）
        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL
        effective_model = model or settings.DEEPSEEK_MODEL

        if not effective_api_key:
            return "general"

        client = AsyncOpenAI(api_key=effective_api_key, base_url=effective_base_url)

        system_prompt = """你是一个意图分类器。请根据用户的消息，判断它属于以下哪个领域：
- rag: 涉及 RAG（检索增强生成）、文档分块、向量检索、Embedding、pgvector、混合检索、重排等
- langgraph: 涉及 LangGraph、状态机、多智能体、节点、边、条件路由、状态持久化等
- llmops: 涉及 LLMOps、模型评测、监控、部署、容器化、性能测试等
- general: 通用对话、闲聊、编程问题、其他不属于上述三类的

请只返回一个 JSON 对象：{"domain": "rag|langgraph|llmops|general"}"""

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
            if domain in DOMAIN_ROLE_MAP:
                return domain
            return "general"
        except Exception as e:
            print(f"[Agent Router] Intent classification failed: {e}")
            return "general"


agent_service = AgentService()
