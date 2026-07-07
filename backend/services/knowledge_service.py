"""知识图谱服务 — 图数据组装、点亮逻辑、PageRank 拟合"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
from collections import defaultdict
from datetime import datetime, timezone

from models.database import (
    KnowledgeNode,
    KnowledgeRelation,
    UserKnowledgeState,
    Lab,
)


class KnowledgeService:
    """知识图谱数据组装与点亮逻辑"""

    async def get_graph_data(
        self, session: AsyncSession, user_id: UUID, document_id: Optional[UUID] = None
    ) -> dict:
        """返回学习路线 nodes + relations + 当前用户 UserKnowledgeState

        仅返回 source='learning_path' 的种子节点（对应 docs/六大数据 目录结构），
        支持根据 document_id 过滤某本电子书专属的图谱（为 None 则代表系统内置图谱）。
        """

        # 1. 获取学习路线知识节点（排除文档自动提取的 extraction 节点，并根据书籍 ID 过滤隔离）
        if document_id:
            stmt_nodes = select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.source == "learning_path",
                    KnowledgeNode.document_id == document_id
                )
            )
        else:
            stmt_nodes = select(KnowledgeNode).where(
                and_(
                    KnowledgeNode.source == "learning_path",
                    KnowledgeNode.document_id.is_(None)
                )
            )
        result_nodes = await session.execute(stmt_nodes)
        nodes = result_nodes.scalars().all()

        # 学习路线节点 id 集合，用于过滤关系（只保留两端都在学习路线中的边）
        lp_node_ids: set[UUID] = {n.id for n in nodes}

        # 2. 获取关系（仅学习路线子图内部）
        stmt_rels = select(KnowledgeRelation)
        result_rels = await session.execute(stmt_rels)
        all_relations = result_rels.scalars().all()
        relations = [
            r for r in all_relations
            if r.source_node_id in lp_node_ids and r.target_node_id in lp_node_ids
        ]

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

    async def apply_evaluation_result(
        self,
        session: AsyncSession,
        user_id: UUID,
        node_id: UUID,
        score: int,
        status: str,
    ) -> dict:
        """
        评测后联动更新用户知识状态：
        - 通过（status=passed 或 score>=60）：点亮知识节点，proficiency 取历史最高
        - 未通过：保持未点亮，但记录 proficiency 作为薄弱点供路径推荐
        """
        node = await session.get(KnowledgeNode, node_id)
        if not node:
            return {"error": "Knowledge node not found"}

        # 查找或创建用户知识状态
        stmt = select(UserKnowledgeState).where(
            and_(
                UserKnowledgeState.user_id == user_id,
                UserKnowledgeState.node_id == node_id,
            )
        )
        state = (await session.execute(stmt)).scalars().first()
        if state is None:
            state = UserKnowledgeState(
                user_id=user_id,
                node_id=node_id,
                proficiency=0.0,
                pagerank_score=0.0,
                is_lighted=0,
                study_duration=0,
            )
            session.add(state)

        # proficiency 取历史最高（不因一次低分回退），按评测分数映射 0-1
        new_proficiency = score / 100.0
        state.proficiency = max(state.proficiency, new_proficiency)

        # 通过 → 点亮（成就标记，永久）；未通过 → 不撤销已点亮，仅标记本次状态
        if status == "passed" or score >= 60:
            state.is_lighted = 1
            action = "lighted"
        elif state.is_lighted:
            # 已点亮节点本次未通过，不撤销成就
            action = "already_lighted"
        else:
            # 未点亮节点本次未通过，标记薄弱供路径推荐
            action = "weak"

        state.last_studied_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await session.commit()

        return {
            "node_id": str(node_id),
            "action": action,
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
        self,
        session: AsyncSession,
        damping: float = 0.85,
        max_iter: int = 100,
        tol: float = 1e-6,
    ) -> dict:
        """
        标准 PageRank 迭代算法 — 基于图结构与阻尼系数计算节点重要性。
        仅计算学习路线子图（source='learning_path'），调用纯算法函数迭代，收敛后写回 pagerank_weight。
        """
        stmt_nodes = select(KnowledgeNode).where(
            KnowledgeNode.source == "learning_path"
        )
        result_nodes = await session.execute(stmt_nodes)
        nodes = result_nodes.scalars().all()

        lp_node_ids: set[UUID] = {n.id for n in nodes}

        stmt_rels = select(KnowledgeRelation)
        result_rels = await session.execute(stmt_rels)
        all_relations = result_rels.scalars().all()
        relations = [
            r for r in all_relations
            if r.source_node_id in lp_node_ids and r.target_node_id in lp_node_ids
        ]

        # 纯结构 PageRank：不融合历史权重，避免重复计算导致分数衰减
        rel_pairs = [(r.source_node_id, r.target_node_id) for r in relations]

        # 调用纯算法函数迭代（无 DB 依赖，便于单元测试）
        scores = self._pagerank_iterate(
            [n.id for n in nodes], rel_pairs, {},
            damping, max_iter, tol,
        )

        # 写回数据库持久化
        result: dict[str, float] = {}
        for n in nodes:
            score = scores.get(n.id, 0.0)
            n.pagerank_weight = score
            result[str(n.id)] = score

        await session.commit()
        return result

    def _pagerank_iterate(
        self,
        node_ids: list[UUID],
        rel_pairs: list[tuple[UUID, UUID]],
        base_weights: dict[UUID, float],
        damping: float = 0.85,
        max_iter: int = 100,
        tol: float = 1e-6,
    ) -> dict[UUID, float]:
        """
        纯算法：标准 PageRank 迭代，不涉及 DB。
        迭代公式: PR(n) = (1-d)/N + d × (Σ PR(m)/outDeg(m) + dangling/N)
        返回归一化并融合基础权重后的分数 {node_id: score}。
        """
        N = len(node_ids)
        if N == 0:
            return {}

        # 构建出度与入链邻接（source→target 表示 source 是 target 的前置）
        out_degree: dict[UUID, int] = defaultdict(int)
        in_links: dict[UUID, list[UUID]] = defaultdict(list)
        for src, tgt in rel_pairs:
            out_degree[src] += 1
            in_links[tgt].append(src)

        # 初始化 PR = 1/N
        pr: dict[UUID, float] = {nid: 1.0 / N for nid in node_ids}

        # 迭代直至收敛
        for _ in range(max_iter):
            # 悬挂节点（无出度）的 PR 均分给全图
            dangling_sum = sum(
                pr[nid] for nid in node_ids if out_degree.get(nid, 0) == 0
            )
            new_pr: dict[UUID, float] = {}
            for nid in node_ids:
                rank = (1 - damping) / N + damping * dangling_sum / N
                # 累加入链节点的贡献
                for m in in_links.get(nid, []):
                    deg = out_degree.get(m, 1)
                    rank += damping * pr[m] / deg
                new_pr[nid] = rank

            # 收敛判断
            diff = sum(abs(new_pr[nid] - pr[nid]) for nid in node_ids)
            pr = new_pr
            if diff < tol:
                break

        # 归一化 + 融合节点基础权重
        total = sum(pr.values()) or 1.0
        return {
            nid: round(pr[nid] / total * base_weights.get(nid, 1.0), 4)
            for nid in node_ids
        }

    async def recommend_learning_path(
        self,
        session: AsyncSession,
        user_id: UUID,
        top_n: int = 8,
    ) -> list:
        """
        基于 PageRank 重要性 + 前置依赖满足度，推荐下一步学习节点。
        仅在学习路线节点（source='learning_path'）中推荐。
        策略：
          1. 优先推荐前置已全部掌握的未点亮节点
          2. 薄弱知识点（有 proficiency 但未点亮）加权优先，引导巩固
          3. 新用户无状态时退化为按重要性推荐
        """
        # 1. 加载学习路线节点、关系、用户状态
        stmt_nodes = select(KnowledgeNode).where(
            KnowledgeNode.source == "learning_path"
        )
        nodes = (await session.execute(stmt_nodes)).scalars().all()

        lp_node_ids: set[UUID] = {n.id for n in nodes}

        stmt_rels = select(KnowledgeRelation)
        all_relations = (await session.execute(stmt_rels)).scalars().all()
        relations = [
            r for r in all_relations
            if r.source_node_id in lp_node_ids and r.target_node_id in lp_node_ids
        ]

        stmt_states = select(UserKnowledgeState).where(
            UserKnowledgeState.user_id == user_id
        )
        states = (await session.execute(stmt_states)).scalars().all()
        state_map: dict[UUID, UserKnowledgeState] = {s.node_id: s for s in states}

        # PageRank 分数：优先用已持久化的 pagerank_weight，全 0 则现场计算
        pr_scores: dict[UUID, float] = {
            n.id: n.pagerank_weight or 0.0 for n in nodes
        }
        if all(v == 0.0 for v in pr_scores.values()):
            computed = await self.compute_pagerank(session)
            pr_scores = {n.id: computed.get(str(n.id), 0.0) for n in nodes}

        # 2. 已点亮集合
        lighted: set[UUID] = {s.node_id for s in states if s.is_lighted}

        # 3. 前置依赖：target -> {sources}（仅 requires 类视为硬前置）
        prereqs: dict[UUID, set[UUID]] = defaultdict(set)
        for r in relations:
            if r.relation_type in ("requires", "prerequisite", "depends_on"):
                prereqs[r.target_node_id].add(r.source_node_id)

        # 4. 筛选可推荐节点（未点亮 + 前置满足）
        candidates: list[tuple] = []
        for n in nodes:
            if n.id in lighted:
                continue
            reqs = prereqs.get(n.id, set())
            if reqs and not reqs.issubset(lighted):
                continue  # 前置未全部掌握，暂不推荐
            state = state_map.get(n.id)
            proficiency = state.proficiency if state else 0.0
            # 薄弱点加权：学过但未点亮 → 优先巩固
            score = pr_scores.get(n.id, 0.0) * (1 + proficiency)
            candidates.append((n, score, proficiency))

        # 5. 兜底：候选为空（新用户/前置全未满足）→ 退化为按重要性推荐
        if not candidates:
            for n in nodes:
                if n.id in lighted:
                    continue
                state = state_map.get(n.id)
                proficiency = state.proficiency if state else 0.0
                score = pr_scores.get(n.id, 0.0) * (1 + proficiency)
                candidates.append((n, score, proficiency))

        # 6. 按 score 降序排序，取 top_n
        candidates.sort(key=lambda x: x[1], reverse=True)

        result = []
        for n, _score, proficiency in candidates[:top_n]:
            result.append(
                {
                    "id": str(n.id),
                    "code": n.code,
                    "name": n.name,
                    "category": n.category,
                    "description": n.description or "",
                    "pagerank": pr_scores.get(n.id, 0.0),
                    "proficiency": proficiency,
                    "reason": "薄弱知识点，建议巩固" if proficiency > 0 else "核心知识点，建议学习",
                }
            )
        return result


knowledge_service = KnowledgeService()
