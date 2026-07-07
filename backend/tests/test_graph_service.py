"""
graph_service 测试 — 六大知识领域意图分析 + RAG 检索工作流
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from services.graph_service import AgentState, GraphService, graph_service, DOMAINS


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
            "messages", "user_id", "sub_tasks", "classified_domain",
            "agent_results", "final_answer",
            "api_key", "model", "base_url",
            "session", "user_message",
        ]
        for field in expected_fields:
            assert field in annotations, f"AgentState 缺少字段: {field}"

    def test_domains_defined(self):
        """测试：六大领域已定义"""
        assert len(DOMAINS) == 6
        for key, val in DOMAINS.items():
            assert "zh" in val
            assert "mentor" in val

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
    """Orchestrator 意图分类节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_classify_dsa(self, service):
        """测试：数据结构问题分类为 dsa"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"domain": "dsa"}'

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "什么是栈的后进先出？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert result["classified_domain"] == "dsa"
        assert len(result["sub_tasks"]) == 1
        assert result["sub_tasks"][0]["domain"] == "dsa"

    @pytest.mark.asyncio
    async def test_classify_os(self, service):
        """测试：操作系统问题分类为 os"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"domain": "os"}'

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "进程和线程的区别是什么？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert result["classified_domain"] == "os"

    @pytest.mark.asyncio
    async def test_classify_general(self, service):
        """测试：通用问题分类为 general"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"domain": "general"}'

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "今天天气怎么样？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert result["classified_domain"] == "general"

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

        assert result["classified_domain"] == "general"

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

        assert result["classified_domain"] == "general"

    @pytest.mark.asyncio
    async def test_invalid_domain_fallback(self, service):
        """测试：LLM 返回无效领域时回退到 general"""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"domain": "invalid_domain"}'

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.orchestrator_node(state)

        assert result["classified_domain"] == "general"


class TestRouteToAgents:
    """条件路由函数测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    def test_route_dsa_to_rag_bot(self, service):
        """测试：dsa 领域路由到 rag_bot"""
        state: AgentState = {"classified_domain": "dsa"}
        assert service.route_to_agents(state) == "rag_bot"

    def test_route_programming_to_rag_bot(self, service):
        """测试：programming 领域路由到 rag_bot"""
        state: AgentState = {"classified_domain": "programming"}
        assert service.route_to_agents(state) == "rag_bot"

    def test_route_network_to_rag_bot(self, service):
        """测试：network 领域路由到 rag_bot"""
        state: AgentState = {"classified_domain": "network"}
        assert service.route_to_agents(state) == "rag_bot"

    def test_route_general_to_reviewer(self, service):
        """测试：general 领域路由到 reviewer"""
        state: AgentState = {"classified_domain": "general"}
        assert service.route_to_agents(state) == "reviewer"

    def test_route_all_six_domains(self, service):
        """测试：六大领域全部路由到 rag_bot"""
        for domain in DOMAINS:
            state: AgentState = {"classified_domain": domain}
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
            return_value="知识库检索到的内容",
        )

        with patch("services.rag_service.rag_service", mock_rag):
            state: AgentState = {
                "user_message": "什么是栈？",
                "api_key": "test-key",
                "base_url": "http://test",
                "session": MagicMock(),
                "user_id": "user-123",
            }
            result = await service.rag_bot_node(state)

        assert "agent_results" in result
        assert result["agent_results"]["rag"]["context"] == "知识库检索到的内容"
        assert result["agent_results"]["rag"]["error"] is None

    @pytest.mark.asyncio
    async def test_no_session(self, service):
        """测试：无数据库会话返回错误信息"""
        state: AgentState = {
            "user_message": "问题",
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
                "user_message": "问题",
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


class TestReviewerNode:
    """Reviewer 节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_domain_answer_with_rag(self, service):
        """测试：六大领域问题使用领域导师风格 + RAG 上下文"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="数据结构回答",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "什么是栈？",
                "api_key": "test-key",
                "model": "test-model",
                "classified_domain": "dsa",
                "agent_results": {
                    "rag": {"context": "栈是后进先出的数据结构", "error": None},
                },
            }
            result = await service.reviewer_node(state)

        assert result["final_answer"] == "数据结构回答"
        # 验证 system_prompt 包含领域导师风格
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "益智游戏数据" in system_prompt
        # 验证 RAG 上下文已注入
        assert "栈是后进先出" in system_prompt
        assert "知识库参考资料" in system_prompt

    @pytest.mark.asyncio
    async def test_general_answer(self, service):
        """测试：通用问题不注入 RAG 上下文"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="通用回答",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "你好",
                "api_key": "test-key",
                "model": "test-model",
                "classified_domain": "general",
                "agent_results": {},
            }
            result = await service.reviewer_node(state)

        assert result["final_answer"] == "通用回答"
        # 验证 system_prompt 是通用助手
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "AI 助手" in system_prompt
        assert "知识库参考资料" not in system_prompt

    @pytest.mark.asyncio
    async def test_domain_without_rag_context(self, service):
        """测试：六大领域但无 RAG 上下文时仍使用领域导师风格"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="回答",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "什么是进程？",
                "api_key": "test-key",
                "model": "test-model",
                "classified_domain": "os",
                "agent_results": {
                    "rag": {"context": "", "error": None},
                },
            }
            result = await service.reviewer_node(state)

        assert result["final_answer"] == "回答"
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "并发与系统编程" in system_prompt
        assert "知识库参考资料" not in system_prompt

    @pytest.mark.asyncio
    async def test_empty_llm_response(self, service):
        """测试：LLM 返回空内容时返回默认回答"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="",
        ):
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "classified_domain": "dsa",
                "agent_results": {},
            }
            result = await service.reviewer_node(state)

        assert "抱歉" in result["final_answer"]


class TestBuildWorkflow:
    """StateGraph 工作流构建与集成测试"""

    def test_workflow_compiles(self):
        """测试：工作流可以正常编译"""
        service = GraphService()
        app = service._build_workflow()
        assert app is not None

    @pytest.mark.asyncio
    async def test_domain_path_execution(self):
        """测试：六大领域路径完整执行（orchestrator → rag_bot → reviewer → END）"""
        service = GraphService()

        with patch.object(
            service, "orchestrator_node", new_callable=AsyncMock,
        ) as mock_orc, patch.object(
            service, "rag_bot_node", new_callable=AsyncMock,
        ) as mock_rag, patch.object(
            service, "reviewer_node", new_callable=AsyncMock,
        ) as mock_rev:
            mock_orc.return_value = {
                "sub_tasks": [{"domain": "dsa", "task": "test"}],
                "classified_domain": "dsa",
            }
            mock_rag.return_value = {
                "agent_results": {"rag": {"context": "RAG content", "error": None}},
            }
            mock_rev.return_value = {
                "final_answer": "最终回答",
            }

            app = service._build_workflow()
            state: AgentState = {
                "user_message": "什么是栈？",
                "api_key": "test-key",
                "model": "test-model",
            }
            result = await app.ainvoke(state)

        mock_orc.assert_called_once()
        mock_rag.assert_called_once()
        mock_rev.assert_called_once()
        assert result.get("final_answer") == "最终回答"

    @pytest.mark.asyncio
    async def test_general_path_execution(self):
        """测试：general 路径（orchestrator → reviewer → END，跳过检索）"""
        service = GraphService()

        with patch.object(
            service, "orchestrator_node", new_callable=AsyncMock,
        ) as mock_orc, patch.object(
            service, "reviewer_node", new_callable=AsyncMock,
        ) as mock_rev, patch.object(
            service, "rag_bot_node", new_callable=AsyncMock,
        ) as mock_rag:
            mock_orc.return_value = {
                "sub_tasks": [{"domain": "general", "task": "你好"}],
                "classified_domain": "general",
            }
            mock_rev.return_value = {
                "final_answer": "通用回答",
            }

            app = service._build_workflow()
            state: AgentState = {
                "user_message": "你好",
                "api_key": "test-key",
                "model": "test-model",
            }
            result = await app.ainvoke(state)

        mock_orc.assert_called_once()
        mock_rev.assert_called_once()
        # general 领域不经过 rag_bot
        mock_rag.assert_not_called()
        assert result.get("final_answer") == "通用回答"


class TestRunStream:
    """run_stream() 流式执行测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_domain_path_events(self, service):
        """测试：六大领域路径的事件序列"""
        async def mock_astream(state, stream_mode=None):
            yield {"orchestrator": {"sub_tasks": [{"domain": "dsa", "task": "test"}], "classified_domain": "dsa"}}
            yield {"rag_bot": {"agent_results": {"rag": {"context": "RAG content", "error": None}}}}
            yield {"reviewer": {"final_answer": "最终回答"}}

        mock_app = MagicMock()
        mock_app.astream = mock_astream
        service._app = mock_app

        state: AgentState = {
            "user_message": "什么是栈？",
            "api_key": "test-key",
            "model": "test-model",
        }

        events = []
        async for event in service.run_stream(state):
            events.append(event)

        # 1. orchestrator running
        assert events[0]["type"] == "status"
        assert events[0]["node"] == "orchestrator"
        assert events[0]["status"] == "running"

        # 2. orchestrator done
        assert events[1]["type"] == "status"
        assert events[1]["node"] == "orchestrator"
        assert events[1]["status"] == "done"
        assert events[1]["data"]["domain"] == "dsa"

        # 3. rag_bot running
        assert events[2]["type"] == "status"
        assert events[2]["node"] == "rag_bot"
        assert events[2]["status"] == "running"

        # 4. rag_bot done
        assert events[3]["type"] == "status"
        assert events[3]["node"] == "rag_bot"
        assert events[3]["status"] == "done"

        # 5. reviewer running
        assert events[4]["type"] == "status"
        assert events[4]["node"] == "reviewer"
        assert events[4]["status"] == "running"

        # 6. reviewer done
        assert events[5]["type"] == "status"
        assert events[5]["node"] == "reviewer"
        assert events[5]["status"] == "done"

        # 7. content event
        assert events[6]["type"] == "content"
        assert events[6]["text"] == "最终回答"

        # 8. done event
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_general_path_events(self, service):
        """测试：general 路径的事件序列（跳过检索）"""
        async def mock_astream(state, stream_mode=None):
            yield {"orchestrator": {"sub_tasks": [{"domain": "general", "task": "你好"}], "classified_domain": "general"}}
            yield {"reviewer": {"final_answer": "你好！", }}

        mock_app = MagicMock()
        mock_app.astream = mock_astream
        service._app = mock_app

        state: AgentState = {
            "user_message": "你好",
            "api_key": "test-key",
            "model": "test-model",
        }

        events = []
        async for event in service.run_stream(state):
            events.append(event)

        # orchestrator done → reviewer running（跳过 rag_bot）
        assert events[0]["node"] == "orchestrator"
        assert events[0]["status"] == "running"
        assert events[1]["node"] == "orchestrator"
        assert events[1]["status"] == "done"
        assert events[1]["data"]["domain"] == "general"
        assert events[2]["node"] == "reviewer"
        assert events[2]["status"] == "running"
        assert events[3]["node"] == "reviewer"
        assert events[3]["status"] == "done"
        assert events[4]["type"] == "content"
        assert events[4]["text"] == "你好！"
        assert events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_content_chunking(self, service):
        """测试：最终回答分块"""
        long_answer = "A" * 50  # 50 chars → 3 chunks (20+20+10)
        async def mock_astream(state, stream_mode=None):
            yield {"orchestrator": {"classified_domain": "general"}}
            yield {"reviewer": {"final_answer": long_answer}}

        mock_app = MagicMock()
        mock_app.astream = mock_astream
        service._app = mock_app

        events = []
        async for event in service.run_stream({"user_message": "test", "api_key": "k", "model": "m"}):
            events.append(event)

        content_events = [e for e in events if e["type"] == "content"]
        assert len(content_events) == 3
        assert content_events[0]["text"] == "A" * 20
        assert content_events[1]["text"] == "A" * 20
        assert content_events[2]["text"] == "A" * 10

    @pytest.mark.asyncio
    async def test_label_in_events(self, service):
        """测试：事件包含中文标签"""
        async def mock_astream(state, stream_mode=None):
            yield {"orchestrator": {"classified_domain": "dsa", "sub_tasks": [{"domain": "dsa"}]}}
            yield {"rag_bot": {"agent_results": {"rag": {"context": "x"}}}}
            yield {"reviewer": {"final_answer": "ans"}}

        mock_app = MagicMock()
        mock_app.astream = mock_astream
        service._app = mock_app

        events = []
        async for event in service.run_stream({"user_message": "t", "api_key": "k", "model": "m"}):
            events.append(event)

        # 验证标签
        orchestrator_events = [e for e in events if e.get("node") == "orchestrator"]
        assert orchestrator_events[0]["label"] == "意图分析"

        rag_events = [e for e in events if e.get("node") == "rag_bot"]
        assert rag_events[0]["label"] == "知识检索"

        reviewer_events = [e for e in events if e.get("node") == "reviewer"]
        assert reviewer_events[0]["label"] == "生成回答"
