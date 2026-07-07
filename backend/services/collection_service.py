from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from uuid import UUID
from models.database import UserCollectionExercise
from models.schemas import CollectionExerciseCreate

class CollectionService:
    """题目收藏夹服务"""

    async def collect_exercise(
        self, session: AsyncSession, user_id: UUID, schema: CollectionExerciseCreate
    ) -> UserCollectionExercise:
        """收藏一道由 Agent 动态生成的题目"""
        node_uuid = UUID(schema.node_id) if schema.node_id else None
        
        # 建立收藏对象
        exercise = UserCollectionExercise(
            user_id=user_id,
            node_id=node_uuid,
            title=schema.title,
            exercise_type=schema.exercise_type,
            content=schema.content,
            answer=schema.answer,
            explanation=schema.explanation,
        )
        session.add(exercise)
        await session.commit()
        await session.refresh(exercise)
        return exercise

    async def get_collections(
        self, session: AsyncSession, user_id: UUID
    ) -> list[UserCollectionExercise]:
        """获取用户收藏的全部题目列表"""
        stmt = (
            select(UserCollectionExercise)
            .where(UserCollectionExercise.user_id == user_id)
            .order_by(UserCollectionExercise.created_at.desc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def delete_collection(
        self, session: AsyncSession, user_id: UUID, collection_id: UUID
    ) -> bool:
        """根据收藏 ID 删除对应的收藏记录"""
        stmt = delete(UserCollectionExercise).where(
            and_(
                UserCollectionExercise.id == collection_id,
                UserCollectionExercise.user_id == user_id
            )
        )
        result = await session.execute(stmt)
        await session.commit()
        return (result.rowcount or 0) > 0

    async def check_is_collected(
        self, session: AsyncSession, user_id: UUID, title: str
    ) -> bool:
        """检查同名（或同干）题目是否已被该用户收藏，防止重复收藏"""
        stmt = select(UserCollectionExercise).where(
            and_(
                UserCollectionExercise.user_id == user_id,
                UserCollectionExercise.title == title
            )
        )
        res = await session.execute(stmt)
        return res.scalars().first() is not None

collection_service = CollectionService()
