"""知识图谱 API — 图数据、点亮、节点实验"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from core.database import get_session
from core.dependencies import get_current_user
from models.database import User
from services.knowledge_service import knowledge_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/graph")
async def get_knowledge_graph(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """返回全量 nodes + relations + 当前用户 UserKnowledgeState"""
    return await knowledge_service.get_graph_data(session, current_user.id)


@router.post("/nodes/{node_id}/light")
async def toggle_node_light(
    node_id: str,
    light: Optional[bool] = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """切换节点点亮状态"""
    try:
        parsed_id = UUID(node_id)
    except ValueError:
        raise HTTPException(400, "Invalid node_id")

    result = await knowledge_service.toggle_node_light(
        session, current_user.id, parsed_id, light
    )
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


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
