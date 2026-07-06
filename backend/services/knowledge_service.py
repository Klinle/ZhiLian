"""知识图谱服务 — 图数据组装、点亮逻辑、PageRank 拟合"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
from collections import defaultdict
from datetime import datetime

from models.database import (
    KnowledgeNode,
    KnowledgeRelation,
    UserKnowledgeState,
    Lab,
)


class KnowledgeService:
    """知识图谱数据组装与点亮逻辑"""

    async def get_graph_data(
        self, session: AsyncSession, user_id: UUID
    ) -> dict:
        """返回全量 nodes + relations + 当前用户 UserKnowledgeState"""

        # 1. 获取所有知识节点
        stmt_nodes = select(KnowledgeNode)
        result_nodes = await session.execute(stmt_nodes)
        nodes = result_nodes.scalars().all()

        # 2. 获取所有关系
        stmt_rels = select(KnowledgeRelation)
        result_rels = await session.execute(stmt_rels)
        relations = result_rels.scalars().all()

        # 3. 获取当前用户的知识状态
        stmt_states = select(UserKnowledgeState).where(
            UserKnowledgeState.user_id == user_id
        )
        result_states = await session.execute(stmt_states)
        states = result_states.scalars().all()

        # 构建状态映射: node_id -> state
        state_map: dict[UUID, UserKnowledgeState] = {}
        for s in states:
            state_map[s.node_id] = s

        # 4. 组装 nodes 列表
        node_list = []
        for node in nodes:
            state = state_map.get(node.id)
            is_lighted = bool(state.is_lighted) if state else False
            proficiency = state.proficiency if state else 0.0
            study_duration = state.study_duration if state else 0

            node_list.append(
                {
                    "id": str(node.id),
                    "code": node.code,
                    "name": node.name,
                    "category": node.category,
                    "description": node.description or "",
                    "pagerank_weight": node.pagerank_weight,
                    "is_lighted": is_lighted,
                    "proficiency": proficiency,
                    "study_duration": study_duration,
                }
            )

        # 5. 组装 relations 列表
        relation_list = [
            {
                "source": str(r.source_node_id),
                "target": str(r.target_node_id),
                "relation_type": r.relation_type,
            }
            for r in relations
        ]

        # 6. 统计
        total_nodes = len(node_list)
        lighted_count = sum(1 for n in node_list if n["is_lighted"])

        # 7. 按分类统计点亮情况
        categories: dict[str, dict] = defaultdict(
            lambda: {"total": 0, "lighted": 0}
        )
        for n in node_list:
            cat = n["category"] or "Other"
            categories[cat]["total"] += 1
            if n["is_lighted"]:
                categories[cat]["lighted"] += 1

        return {
            "nodes": node_list,
            "relations": relation_list,
            "stats": {
                "total_nodes": total_nodes,
                "lighted_nodes": lighted_count,
                "categories": dict(categories),
            },
        }

    async def toggle_node_light(
        self,
        session: AsyncSession,
        user_id: UUID,
        node_id: UUID,
        light: Optional[bool] = None,
    ) -> dict:
        """切换节点点亮状态，更新 proficiency"""

        # 检查节点是否存在
        node = await session.get(KnowledgeNode, node_id)
        if not node:
            return {"error": "Knowledge node not found"}

        # 查找现有状态
        stmt = select(UserKnowledgeState).where(
            and_(
                UserKnowledgeState.user_id == user_id,
                UserKnowledgeState.node_id == node_id,
            )
        )
        result = await session.execute(stmt)
        state = result.scalars().first()

        if state is None:
            # 创建新状态
            state = UserKnowledgeState(
                user_id=user_id,
                node_id=node_id,
                proficiency=0.0,
                pagerank_score=0.0,
                is_lighted=0,
                study_duration=0,
            )
            session.add(state)

        # 切换或设置点亮状态
        if light is not None:
            state.is_lighted = 1 if light else 0
        else:
            state.is_lighted = 0 if state.is_lighted else 1

        # 点亮时提升 proficiency
        if state.is_lighted:
            if state.proficiency < 1.0:
                state.proficiency = min(1.0, state.proficiency + 0.3)
        else:
            state.proficiency = max(0.0, state.proficiency - 0.1)

        state.last_studied_at = datetime.utcnow()
        await session.commit()

        return {
            "node_id": str(node_id),
            "is_lighted": bool(state.is_lighted),
            "proficiency": state.proficiency,
        }

    async def get_node_labs(
        self, session: AsyncSession, node_id: UUID
    ) -> list:
        """返回该节点关联的 Lab 列表"""

        stmt = select(Lab).where(Lab.node_id == node_id)
        result = await session.execute(stmt)
        labs = result.scalars().all()

        return [
            {
                "id": str(lab.id),
                "title": lab.title,
                "description": lab.description or "",
                "difficulty": lab.difficulty,
                "lab_type": lab.lab_type,
                "node_id": str(lab.node_id) if lab.node_id else None,
            }
            for lab in labs
        ]

    async def compute_pagerank(
        self, session: AsyncSession
    ) -> dict:
        """简化版 PageRank 拟合 — 基于入度与 pagerank_weight"""
        
        stmt_nodes = select(KnowledgeNode)
        result_nodes = await session.execute(stmt_nodes)
        nodes = result_nodes.scalars().all()

        stmt_rels = select(KnowledgeRelation)
        result_rels = await session.execute(stmt_rels)
        relations = result_rels.scalars().all()

        # 构建入度
        in_degree: dict[UUID, int] = defaultdict(int)
        for r in relations:
            in_degree[r.target_node_id] += 1

        # PageRank-like: score = weight * (1 + in_degree * 0.1)
        scores = {}
        for node in nodes:
            base = node.pagerank_weight or 1.0
            ind = in_degree.get(node.id, 0)
            scores[str(node.id)] = base * (1 + ind * 0.1)

        return scores


knowledge_service = KnowledgeService()
