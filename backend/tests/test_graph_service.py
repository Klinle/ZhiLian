"""
T5 测试：graph_service 基础结构与 AgentState 定义
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

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


class TestOrchestratorNode:
    """Orchestrator 任务分解节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_single_domain_decomposition(self, service):
        """测试：单领域任务分解"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = (
            '[{"domain": "rag", "task": "检索混合检索最佳实践"}]'
        )

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "什么是混合检索？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert "sub_tasks" in result
        assert len(result["sub_tasks"]) == 1
        assert result["sub_tasks"][0]["domain"] == "rag"
        assert result["needs_review"] is False

    @pytest.mark.asyncio
    async def test_multi_domain_decomposition(self, service):
        """测试：多领域任务分解"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = (
            '[{"domain": "rag", "task": "检索RAG最佳实践"}, '
            '{"domain": "langgraph", "task": "设计状态机方案"}]'
        )

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "如何用 RAG 提升 LangGraph 质量？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert len(result["sub_tasks"]) == 2
        assert result["needs_review"] is True

    @pytest.mark.asyncio
    async def test_no_api_key_fallback(self, service):
        """测试：无 API Key 时回退到 general"""
        state: AgentState = {
            "user_message": "你好",
            "api_key": "",
            "model": "",
            "base_url": None,
        }
        result = await service.orchestrator_node(state)

        assert len(result["sub_tasks"]) == 1
        assert result["sub_tasks"][0]["domain"] == "general"

    @pytest.mark.asyncio
    async def test_llm_error_fallback(self, service):
        """测试：LLM 调用失败时回退到 general"""
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("API Error"),
        )

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert len(result["sub_tasks"]) == 1
        assert result["sub_tasks"][0]["domain"] == "general"


class TestRouteToAgents:
    """条件路由函数测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    def test_route_to_rag(self, service):
        """测试：RAG 领域路由到 rag_bot"""
        state: AgentState = {"sub_tasks": [{"domain": "rag", "task": "test"}]}
        assert service.route_to_agents(state) == "rag_bot"

    def test_route_to_langgraph(self, service):
        """测试：LangGraph 领域路由到 graph_bot"""
        state: AgentState = {"sub_tasks": [{"domain": "langgraph", "task": "test"}]}
        assert service.route_to_agents(state) == "graph_bot"

    def test_route_to_llmops(self, service):
        """测试：LLMOps 领域路由到 ops_bot"""
        state: AgentState = {"sub_tasks": [{"domain": "llmops", "task": "test"}]}
        assert service.route_to_agents(state) == "ops_bot"

    def test_route_to_reviewer_for_general(self, service):
        """测试：general 领域路由到 reviewer"""
        state: AgentState = {"sub_tasks": [{"domain": "general", "task": "test"}]}
        assert service.route_to_agents(state) == "reviewer"

    def test_route_priority(self, service):
        """测试：多领域时按优先级返回第一个匹配"""
        state: AgentState = {
            "sub_tasks": [
                {"domain": "rag", "task": "test1"},
                {"domain": "langgraph", "task": "test2"},
            ]
        }
        assert service.route_to_agents(state) == "rag_bot"


class TestRagBotNode:
    """RagBot 检索节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_normal_retrieval(self, service):
        """测试：正常检索返回知识库上下文"""
        mock_rag = MagicMock()
        mock_rag.get_context_for_query = AsyncMock(
            return_value="RAG context content",
        )

        with patch("services.rag_service.rag_service", mock_rag):
            state: AgentState = {
                "user_message": "什么是RAG？",
                "api_key": "test-key",
                "base_url": "http://test",
                "session": MagicMock(),
                "user_id": "user-123",
            }
            result = await service.rag_bot_node(state)

        assert "agent_results" in result
        assert result["agent_results"]["rag"]["context"] == "RAG context content"
        assert result["agent_results"]["rag"]["error"] is None

    @pytest.mark.asyncio
    async def test_no_session(self, service):
        """测试：无数据库会话返回错误信息"""
        state: AgentState = {
            "user_message": "什么是RAG？",
            "api_key": "test-key",
            "session": None,
        }
        result = await service.rag_bot_node(state)

        assert result["agent_results"]["rag"]["context"] == ""
        assert "无数据库会话" in result["agent_results"]["rag"]["error"]

    @pytest.mark.asyncio
    async def test_retrieval_error(self, service):
        """测试：检索异常返回错误信息"""
        mock_rag = MagicMock()
        mock_rag.get_context_for_query = AsyncMock(
            side_effect=Exception("DB Error"),
        )

        with patch("services.rag_service.rag_service", mock_rag):
            state: AgentState = {
                "user_message": "什么是RAG？",
                "api_key": "test-key",
                "session": MagicMock(),
                "user_id": "user-123",
            }
            result = await service.rag_bot_node(state)

        assert result["agent_results"]["rag"]["context"] == ""
        assert "DB Error" in result["agent_results"]["rag"]["error"]

    @pytest.mark.asyncio
    async def test_empty_context(self, service):
        """测试：检索返回空上下文时正常处理"""
        mock_rag = MagicMock()
        mock_rag.get_context_for_query = AsyncMock(return_value=None)

        with patch("services.rag_service.rag_service", mock_rag):
            state: AgentState = {
                "user_message": "无关问题",
                "api_key": "test-key",
                "session": MagicMock(),
                "user_id": "user-123",
            }
            result = await service.rag_bot_node(state)

        assert result["agent_results"]["rag"]["context"] == ""
        assert result["agent_results"]["rag"]["error"] is None
