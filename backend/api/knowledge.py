"""知识图谱 API — 图数据、节点实验"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional

from core.database import get_session
from core.dependencies import get_current_user
from models.database import User
from services.knowledge_service import knowledge_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/graph")
async def get_knowledge_graph(
    knowledge_base_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """返回学习路线 nodes + relations + 当前用户 UserKnowledgeState"""
    parsed_kb_id = None
    if knowledge_base_id:
        try:
            parsed_kb_id = UUID(knowledge_base_id)
        except ValueError:
            raise HTTPException(400, "Invalid knowledge_base_id format")

    return await knowledge_service.get_graph_data(session, current_user.id, parsed_kb_id)


@router.get("/nodes/{node_id}/labs")
async def get_node_labs(
    node_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """返回该节点关联的 Lab 列表"""
    try:
        parsed_id = UUID(node_id)
    except ValueError:
        raise HTTPException(400, "Invalid node_id")

    return await knowledge_service.get_node_labs(session, parsed_id)


@router.post("/pagerank")
async def compute_pagerank(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """计算并持久化学习路线子图 PageRank 权重（标准迭代算法）"""
    return await knowledge_service.compute_pagerank(session)


@router.get("/recommend")
async def recommend_learning_path(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """基于 PageRank + 前置依赖，推荐当前用户的下一步学习路径"""
    return await knowledge_service.recommend_learning_path(session, current_user.id)
