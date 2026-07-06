"""
T5 测试：graph_service 基础结构与 AgentState 定义
"""
import pytest

from services.graph_service import AgentState, GraphService, graph_service


class TestGraphServiceBasic:
    """graph_service 基础结构测试"""

    def test_module_import(self):
        """测试：模块可正常导入"""
        from services import graph_service as gs_module
        assert gs_module is not None

    def test_agent_state_fields(self):
        """测试：AgentState 包含所有必需字段"""
        annotations = AgentState.__annotations__

        expected_fields = [
            "messages", "user_id", "user_cognitive_state",
            "sub_tasks", "agent_results", "final_answer",
            "needs_review", "api_key", "model", "base_url",
            "session", "user_message",
        ]
        for field in expected_fields:
            assert field in annotations, f"AgentState 缺少字段: {field}"

    def test_graph_service_instance(self):
        """测试：GraphService 可实例化"""
        service = GraphService()
        assert service is not None
        assert service._app is None

    def test_global_instance(self):
        """测试：全局实例 graph_service 存在"""
        assert graph_service is not None
        assert isinstance(graph_service, GraphService)
