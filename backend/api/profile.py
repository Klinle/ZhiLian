"""学习画像 API — 统计数据 + 雷达图"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user
from models.database import User
from services.profile_service import profile_service

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/stats")
async def get_profile_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """聚合：点亮节点数 / 实验通过率 / 学习时长 / 记忆数"""
    return await profile_service.get_stats(session, current_user.id)


@router.get("/radar")
async def get_profile_radar(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    return await profile_service.get_radar(session, current_user.id)
