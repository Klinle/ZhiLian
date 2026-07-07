"""学习画像服务 — 聚合 UserKnowledgeState + UserLabSubmission + Memory 数据"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from uuid import UUID
from collections import defaultdict

from models.database import (
    UserKnowledgeState,
    UserLabSubmission,
    Memory,
    KnowledgeNode,
    Lab,
)


class ProfileService:
    """聚合用户学习数据"""

    async def get_stats(
        self, session: AsyncSession, user_id: UUID
    ) -> dict:
        """聚合统计：点亮节点数 / 实验通过率 / 学习时长 / 记忆数"""

        # 1. 点亮节点数
        stmt_lighted = (
            select(func.count(UserKnowledgeState.id))
            .where(
                and_(
                    UserKnowledgeState.user_id == user_id,
                    UserKnowledgeState.is_lighted == 1,
                )
            )
        )
        result_lighted = await session.execute(stmt_lighted)
        lighted_count = result_lighted.scalar() or 0

        # 2. 总节点数
        stmt_total = select(func.count(KnowledgeNode.id))
        result_total = await session.execute(stmt_total)
        total_nodes = result_total.scalar() or 0

        # 3. 实验通过率
        stmt_pass = (
            select(func.count(UserLabSubmission.id))
            .where(
                and_(
                    UserLabSubmission.user_id == user_id,
                    UserLabSubmission.status == "passed",
                )
            )
        )
        result_pass = await session.execute(stmt_pass)
        passed_count = result_pass.scalar() or 0

        stmt_total_sub = (
            select(func.count(UserLabSubmission.id))
            .where(UserLabSubmission.user_id == user_id)
        )
        result_total_sub = await session.execute(stmt_total_sub)
        total_submissions = result_total_sub.scalar() or 0

        pass_rate = round((passed_count / total_submissions) * 100) if total_submissions > 0 else 0

        # 4. 学习时长（秒）
        stmt_duration = (
            select(func.sum(UserKnowledgeState.study_duration))
            .where(UserKnowledgeState.user_id == user_id)
        )
        result_duration = await session.execute(stmt_duration)
        total_duration = result_duration.scalar() or 0

        # 5. 记忆数
        stmt_mem = select(func.count(Memory.id)).where(Memory.user_id == user_id)
        result_mem = await session.execute(stmt_mem)
        memory_count = result_mem.scalar() or 0

        return {
            "lighted_nodes": lighted_count,
            "total_nodes": total_nodes,
            "pass_rate": pass_rate,
            "passed_labs": passed_count,
            "total_submissions": total_submissions,
            "study_duration_hours": round((total_duration or 0) / 3600, 1),
            "memory_count": memory_count,
        }

    async def get_radar(
        self, session: AsyncSession, user_id: UUID
    ) -> dict:
        """六方向（计算机基础）能力维度数据"""

        # 获取用户已点亮节点 + 按分类聚合
        stmt = (
            select(UserKnowledgeState, KnowledgeNode.category)
            .join(KnowledgeNode, UserKnowledgeState.node_id == KnowledgeNode.id)
            .where(
                and_(
                    UserKnowledgeState.user_id == user_id,
                    UserKnowledgeState.is_lighted == 1,
                )
            )
        )
        result = await session.execute(stmt)
        rows = result.all()

        # 按分类统计点亮数和平均熟练度
        category_data: dict[str, dict] = defaultdict(
            lambda: {"lighted": 0, "total_proficiency": 0.0}
        )
        for state, category in rows:
            cat = category or "Other"
            category_data[cat]["lighted"] += 1
            category_data[cat]["total_proficiency"] += state.proficiency or 0

        # 获取每个分类的总节点数
        stmt_cat_total = (
            select(KnowledgeNode.category, func.count(KnowledgeNode.id))
            .group_by(KnowledgeNode.category)
        )
        result_cat_total = await session.execute(stmt_cat_total)
        cat_totals = {row[0]: row[1] for row in result_cat_total.all()}

        category_mapping = {
            "programming": "终端游戏与工具",
            "dsa": "益智游戏数据",
            "organization": "街机游戏设计",
            "os": "实时动作并发",
            "network": "联机对战服务",
            "database": "数据与工程"
        }

        radar_data = []
        for eng_cat, chn_name in category_mapping.items():
            data = category_data.get(eng_cat, {"lighted": 0, "total_proficiency": 0.0})
            total = cat_totals.get(eng_cat, 0)
            lighted = data["lighted"]
            avg_proficiency = (data["total_proficiency"] / lighted * 100) if lighted > 0 else 0
            coverage = round((lighted / total) * 100) if total > 0 else 0

            radar_data.append({
                "direction": chn_name,
                "coverage": coverage,
                "proficiency": round(avg_proficiency),
                "lighted": lighted,
                "total": total,
            })

        return {
            "indicators": [
                {"name": name, "max": 100} for name in category_mapping.values()
            ],
            "values": radar_data,
        }


profile_service = ProfileService()
