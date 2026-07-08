"""
P1-2 测试：knowledge_service PageRank 迭代算法纯逻辑单元测试
覆盖收敛性、对称性、hub 节点、悬挂节点、基础权重融合等核心场景
"""
import pytest
from uuid import UUID
from unittest.mock import AsyncMock, MagicMock

from models.database import UserKnowledgeState
from services.knowledge_service import KnowledgeService


# 固定 UUID 便于断言可读
A = UUID("11111111-1111-1111-1111-111111111111")
B = UUID("22222222-2222-2222-2222-222222222222")
C = UUID("33333333-3333-3333-3333-333333333333")
D = UUID("44444444-4444-4444-4444-444444444444")


class TestPagerankIterate:
    """_pagerank_iterate 纯算法单元测试"""

    @pytest.fixture
    def service(self):
        return KnowledgeService()

    def test_empty_graph(self, service):
        """空图返回空字典"""
        scores = service._pagerank_iterate([], [], {})
        assert scores == {}

    def test_single_node_no_edges(self, service):
        """单节点无边：归一化后 PR × 基础权重 = 1.0"""
        scores = service._pagerank_iterate([A], [], {A: 1.0})
        assert len(scores) == 1
        assert scores[A] == pytest.approx(1.0, abs=1e-3)

    def test_symmetric_cycle_equal(self, service):
        """3 节点环（A→B→C→A）：对称结构 → 各 PR 近似均等"""
        rels = [(A, B), (B, C), (C, A)]
        weights = {A: 1.0, B: 1.0, C: 1.0}
        scores = service._pagerank_iterate([A, B, C], rels, weights)
        # 对称结构三者分数近似相等
        assert scores[A] == pytest.approx(scores[B], abs=1e-3)
        assert scores[B] == pytest.approx(scores[C], abs=1e-3)
        # 归一化总和为 1
        assert sum(scores.values()) == pytest.approx(1.0, abs=1e-2)

    def test_hub_node_highest(self, service):
        """星形图（A→C, B→C）：被指向的 hub 节点 C 分数最高"""
        rels = [(A, C), (B, C)]
        weights = {A: 1.0, B: 1.0, C: 1.0}
        scores = service._pagerank_iterate([A, B, C], rels, weights)
        assert scores[C] > scores[A]
        assert scores[C] > scores[B]

    def test_convergence_deterministic(self, service):
        """收敛性：相同输入多次调用结果一致（确定性算法）"""
        rels = [(A, B), (B, C), (C, A)]
        weights = {A: 1.0, B: 1.0, C: 1.0}
        s1 = service._pagerank_iterate([A, B, C], rels, weights)
        s2 = service._pagerank_iterate([A, B, C], rels, weights)
        assert s1 == s2

    def test_base_weight_fusion(self, service):
        """基础权重影响最终分数：高权重节点在对称图中分数更高"""
        rels = [(A, B), (B, C), (C, A)]  # 对称结构
        weights = {A: 1.0, B: 3.0, C: 1.0}  # B 基础权重高
        scores = service._pagerank_iterate([A, B, C], rels, weights)
        assert scores[B] > scores[A]
        assert scores[B] > scores[C]

    def test_dangling_node_handled(self, service):
        """悬挂节点（无出度）正确处理，不报错且归一化"""
        # A→B, B 无出度（悬挂），C 孤立无连接
        rels = [(A, B)]
        weights = {A: 1.0, B: 1.0, C: 1.0}
        scores = service._pagerank_iterate([A, B, C], rels, weights)
        assert len(scores) == 3
        assert sum(scores.values()) == pytest.approx(1.0, abs=1e-2)

    def test_all_scores_non_negative(self, service):
        """所有分数非负"""
        rels = [(A, B), (B, C), (C, D), (D, A), (A, C)]
        weights = {A: 1.0, B: 1.0, C: 1.0, D: 1.0}
        scores = service._pagerank_iterate([A, B, C, D], rels, weights)
        for score in scores.values():
            assert score >= 0

    def test_more_inlinks_higher_score(self, service):
        """入链越多分数越高（无悬挂干扰）：C 被 A、B 指向，D 仅被 C 指向"""
        # D 有出度（→A, →B）避免悬挂节点回流效应干扰判断
        rels = [(A, C), (B, C), (C, D), (D, A), (D, B)]
        weights = {A: 1.0, B: 1.0, C: 1.0, D: 1.0}
        scores = service._pagerank_iterate([A, B, C, D], rels, weights)
        # C 有两条入链，D 只有一条 → C 分数高于 D
        assert scores[C] > scores[D]


class TestApplyEvaluationResult:
    """apply_evaluation_result 评测联动知识状态测试"""

    @pytest.fixture
    def service(self):
        return KnowledgeService()

    @pytest.fixture
    def mock_session(self):
        return AsyncMock()

    def _setup_session(self, mock_session, node_exists=True, existing_state=None):
        """辅助：配置 mock session 的 get/execute 返回"""
        mock_session.get = AsyncMock(
            return_value=MagicMock() if node_exists else None
        )
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = existing_state
        mock_session.execute = AsyncMock(return_value=mock_result)
        # add 是同步方法，用 MagicMock 避免 AsyncMock 误报 coroutine 未 await
        mock_session.add = MagicMock()

    @pytest.mark.asyncio
    async def test_passed_lights_node(self, service, mock_session):
        """评测通过 → 点亮节点（新建状态）"""
        self._setup_session(mock_session, existing_state=None)

        result = await service.apply_evaluation_result(
            mock_session, A, B, score=80, status="passed"
        )

        assert result["action"] == "lighted"
        assert result["is_lighted"] is True
        assert result["proficiency"] == 0.8
        mock_session.add.assert_called_once()
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_failed_new_node_weak(self, service, mock_session):
        """评测未通过 + 新节点 → 薄弱点（未点亮）"""
        self._setup_session(mock_session, existing_state=None)

        result = await service.apply_evaluation_result(
            mock_session, A, B, score=40, status="failed"
        )

        assert result["action"] == "weak"
        assert result["is_lighted"] is False
        assert result["proficiency"] == 0.4

    @pytest.mark.asyncio
    async def test_already_lighted_no_revocation(self, service, mock_session):
        """已点亮节点未通过 → 不撤销点亮（成就永久）"""
        existing = UserKnowledgeState(
            user_id=A, node_id=B, proficiency=0.9, is_lighted=1
        )
        self._setup_session(mock_session, existing_state=existing)

        result = await service.apply_evaluation_result(
            mock_session, A, B, score=30, status="failed"
        )

        assert result["action"] == "already_lighted"
        assert existing.is_lighted == 1  # 不撤销
        assert existing.proficiency == 0.9  # 不回退
        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_proficiency_takes_max(self, service, mock_session):
        """proficiency 取历史最高，低分不回退"""
        existing = UserKnowledgeState(
            user_id=A, node_id=B, proficiency=0.5, is_lighted=0
        )
        self._setup_session(mock_session, existing_state=existing)

        result = await service.apply_evaluation_result(
            mock_session, A, B, score=80, status="passed"
        )

        assert existing.proficiency == 0.8  # max(0.5, 0.8)
        assert existing.is_lighted == 1
        assert result["action"] == "lighted"

    @pytest.mark.asyncio
    async def test_node_not_found(self, service, mock_session):
        """节点不存在返回 error"""
        self._setup_session(mock_session, node_exists=False)

        result = await service.apply_evaluation_result(
            mock_session, A, B, score=80, status="passed"
        )

        assert "error" in result
