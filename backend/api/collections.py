from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import List

from core.database import get_session
from core.dependencies import get_current_user
from models.database import User
from models.schemas import CollectionExerciseCreate, CollectionExerciseResponse
from services.collection_service import collection_service

router = APIRouter(prefix="/api/collections", tags=["collections"])

@router.post("", response_model=CollectionExerciseResponse)
async def collect_exercise(
    schema: CollectionExerciseCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """收藏一道题目（如 Agent 动态生成的匹配、排序、选择或代码题）"""
    try:
        exercise = await collection_service.collect_exercise(session, current_user.id, schema)
        return exercise
    except Exception as e:
        raise HTTPException(500, f"收藏题目失败: {str(e)}")

@router.get("", response_model=List[CollectionExerciseResponse])
async def get_collections(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取用户收藏的全部题目"""
    return await collection_service.get_collections(session, current_user.id)

@router.delete("/{collection_id}")
async def delete_collection(
    collection_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """取消收藏某道题目"""
    try:
        uuid_id = UUID(collection_id)
    except ValueError:
        raise HTTPException(400, "无效的收藏 ID")
        
    success = await collection_service.delete_collection(session, current_user.id, uuid_id)
    if not success:
        raise HTTPException(404, "未找到该收藏记录")
    return {"message": "取消收藏成功"}

@router.get("/check")
async def check_is_collected(
    title: str = Query(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """检查特定题目的标题是否已被当前用户收藏"""
    is_collected = await collection_service.check_is_collected(session, current_user.id, title)
    return {"is_collected": is_collected}
