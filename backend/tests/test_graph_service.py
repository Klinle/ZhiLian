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


class TestGraphBotNode:
    """GraphBot 教学节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_normal_generation(self, service):
        """测试：正常生成 LangGraph 教学内容"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="LangGraph 状态机设计指南...",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "如何设计多Agent状态机？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.graph_bot_node(state)

        assert result["agent_results"]["langgraph"]["content"] == "LangGraph 状态机设计指南..."
        assert result["agent_results"]["langgraph"]["error"] is None
        # 验证 system_prompt 包含 LangGraph 导师角色
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "LangGraph" in system_prompt

    @pytest.mark.asyncio
    async def test_rag_context_injected(self, service):
        """测试：RagBot 中间结果注入到 system_prompt"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="教学内容",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "状态机设计",
                "api_key": "test-key",
                "model": "test-model",
                "agent_results": {
                    "rag": {"context": "RAG 检索到的知识", "error": None},
                },
            }
            result = await service.graph_bot_node(state)

        # 验证 system_prompt 包含 RAG 上下文
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "RAG 检索到的知识" in system_prompt
        assert "知识库参考资料" in system_prompt

    @pytest.mark.asyncio
    async def test_empty_llm_response(self, service):
        """测试：LLM 返回空内容时设置错误信息"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="",
        ):
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
            }
            result = await service.graph_bot_node(state)

        assert result["agent_results"]["langgraph"]["content"] == ""
        assert result["agent_results"]["langgraph"]["error"] is not None

    @pytest.mark.asyncio
    async def test_no_rag_context(self, service):
        """测试：无 RagBot 中间结果时正常生成"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="教学内容",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "agent_results": {},
            }
            result = await service.graph_bot_node(state)

        assert result["agent_results"]["langgraph"]["content"] == "教学内容"
        # 验证 system_prompt 不包含知识库参考资料
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "知识库参考资料" not in system_prompt


class TestOpsBotNode:
    """OpsBot 运维节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_normal_generation(self, service):
        """测试：正常生成 LLMOps 运维内容"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="LLMOps 评测部署指南...",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "如何评测模型性能？",
                "api_key": "test-key",
                "model": "test-model",
                "base_url": "http://test",
            }
            result = await service.ops_bot_node(state)

        assert result["agent_results"]["llmops"]["content"] == "LLMOps 评测部署指南..."
        assert result["agent_results"]["llmops"]["error"] is None
        # 验证 system_prompt 包含 LLMOps 导师角色
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "LLMOps" in system_prompt

    @pytest.mark.asyncio
    async def test_rag_context_injected(self, service):
        """测试：RagBot 中间结果注入到 system_prompt"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="运维内容",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "模型部署",
                "api_key": "test-key",
                "model": "test-model",
                "agent_results": {
                    "rag": {"context": "RAG 运维知识", "error": None},
                },
            }
            result = await service.ops_bot_node(state)

        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "RAG 运维知识" in system_prompt

    @pytest.mark.asyncio
    async def test_empty_llm_response(self, service):
        """测试：LLM 返回空内容时设置错误信息"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="",
        ):
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
            }
            result = await service.ops_bot_node(state)

        assert result["agent_results"]["llmops"]["content"] == ""
        assert result["agent_results"]["llmops"]["error"] is not None

    @pytest.mark.asyncio
    async def test_no_rag_context(self, service):
        """测试：无 RagBot 中间结果时正常生成"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="运维内容",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "agent_results": {},
            }
            result = await service.ops_bot_node(state)

        assert result["agent_results"]["llmops"]["content"] == "运维内容"
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "知识库参考资料" not in system_prompt


class TestReviewerNode:
    """Reviewer 交叉审查节点测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_multi_agent_aggregation(self, service):
        """测试：多 Agent 结果聚合（needs_review=True）"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="聚合后的最终回答",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "如何用 RAG 提升 LangGraph？",
                "api_key": "test-key",
                "model": "test-model",
                "needs_review": True,
                "agent_results": {
                    "rag": {"context": "RAG 最佳实践", "error": None},
                    "langgraph": {"content": "LangGraph 设计方案", "error": None},
                },
            }
            result = await service.reviewer_node(state)

        assert result["final_answer"] == "聚合后的最终回答"
        assert result["needs_review"] is False
        # 验证 system_prompt 包含审查指令
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "审查" in system_prompt
        assert "一致性" in system_prompt

    @pytest.mark.asyncio
    async def test_single_agent_passthrough(self, service):
        """测试：单 Agent 结果直接输出（needs_review=False）"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="最终回答",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "什么是 RAG？",
                "api_key": "test-key",
                "model": "test-model",
                "needs_review": False,
                "agent_results": {
                    "rag": {"context": "RAG 是检索增强生成", "error": None},
                },
            }
            result = await service.reviewer_node(state)

        assert result["final_answer"] == "最终回答"
        # 验证 system_prompt 不包含审查指令
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "审查" not in system_prompt

    @pytest.mark.asyncio
    async def test_no_results_default_answer(self, service):
        """测试：无任何 Agent 结果时返回默认回答"""
        state: AgentState = {
            "user_message": "问题",
            "api_key": "test-key",
            "model": "test-model",
            "agent_results": {},
        }
        result = await service.reviewer_node(state)

        assert "抱歉" in result["final_answer"]
        assert result["needs_review"] is False

    @pytest.mark.asyncio
    async def test_empty_llm_response_default(self, service):
        """测试：LLM 返回空内容时返回默认回答"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="",
        ):
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "agent_results": {
                    "rag": {"context": "内容", "error": None},
                },
            }
            result = await service.reviewer_node(state)

        assert "抱歉" in result["final_answer"]

    @pytest.mark.asyncio
    async def test_skip_empty_agent_results(self, service):
        """测试：跳过空结果的 Agent"""
        with patch.object(
            service, "_call_llm", new_callable=AsyncMock,
            return_value="回答",
        ) as mock_llm:
            state: AgentState = {
                "user_message": "问题",
                "api_key": "test-key",
                "model": "test-model",
                "agent_results": {
                    "rag": {"context": "", "error": "错误"},
                    "langgraph": {"content": "有效内容", "error": None},
                },
            }
            result = await service.reviewer_node(state)

        assert result["final_answer"] == "回答"
        # 验证 system_prompt 只包含有效内容
        call_args = mock_llm.call_args
        system_prompt = call_args[0][0]
        assert "有效内容" in system_prompt


class TestBuildWorkflow:
    """StateGraph 工作流构建与集成测试"""

    def test_workflow_compiles(self):
        """测试：工作流可以正常编译"""
        service = GraphService()
        app = service._build_workflow()
        assert app is not None

    @pytest.mark.asyncio
    async def test_rag_path_execution(self):
        """测试：RAG 路径完整执行（orchestrator → rag_bot → reviewer → END）"""
        service = GraphService()

        with patch.object(
            service, "orchestrator_node", new_callable=AsyncMock,
        ) as mock_orc, patch.object(
            service, "rag_bot_node", new_callable=AsyncMock,
        ) as mock_rag, patch.object(
            service, "reviewer_node", new_callable=AsyncMock,
        ) as mock_rev:
            mock_orc.return_value = {
                "sub_tasks": [{"domain": "rag", "task": "test"}],
                "needs_review": False,
            }
            mock_rag.return_value = {
                "agent_results": {"rag": {"context": "RAG content", "error": None}},
            }
            mock_rev.return_value = {
                "final_answer": "最终回答",
                "needs_review": False,
            }

            app = service._build_workflow()
            state: AgentState = {
                "user_message": "什么是RAG？",
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
        """测试：general 路径（orchestrator → reviewer → END，跳过 Agent）"""
        service = GraphService()

        with patch.object(
            service, "orchestrator_node", new_callable=AsyncMock,
        ) as mock_orc, patch.object(
            service, "reviewer_node", new_callable=AsyncMock,
        ) as mock_rev, patch.object(
            service, "rag_bot_node", new_callable=AsyncMock,
        ) as mock_rag, patch.object(
            service, "graph_bot_node", new_callable=AsyncMock,
        ) as mock_gra, patch.object(
            service, "ops_bot_node", new_callable=AsyncMock,
        ) as mock_ops:
            mock_orc.return_value = {
                "sub_tasks": [{"domain": "general", "task": "test"}],
                "needs_review": False,
            }
            mock_rev.return_value = {
                "final_answer": "通用回答",
                "needs_review": False,
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
        # general 领域不经过任何 Agent
        mock_rag.assert_not_called()
        mock_gra.assert_not_called()
        mock_ops.assert_not_called()
        assert result.get("final_answer") == "通用回答"

    @pytest.mark.asyncio
    async def test_langgraph_path_execution(self):
        """测试：LangGraph 路径完整执行（orchestrator → graph_bot → reviewer → END）"""
        service = GraphService()

        with patch.object(
            service, "orchestrator_node", new_callable=AsyncMock,
        ) as mock_orc, patch.object(
            service, "graph_bot_node", new_callable=AsyncMock,
        ) as mock_gra, patch.object(
            service, "reviewer_node", new_callable=AsyncMock,
        ) as mock_rev:
            mock_orc.return_value = {
                "sub_tasks": [{"domain": "langgraph", "task": "test"}],
                "needs_review": False,
            }
            mock_gra.return_value = {
                "agent_results": {"langgraph": {"content": "LG content", "error": None}},
            }
            mock_rev.return_value = {
                "final_answer": "LangGraph 回答",
                "needs_review": False,
            }

            app = service._build_workflow()
            state: AgentState = {
                "user_message": "如何设计状态机？",
                "api_key": "test-key",
                "model": "test-model",
            }
            result = await app.ainvoke(state)

        mock_orc.assert_called_once()
        mock_gra.assert_called_once()
        mock_rev.assert_called_once()
        assert result.get("final_answer") == "LangGraph 回答"


class TestRunStream:
    """run_stream() 流式执行测试"""

    @pytest.fixture
    def service(self):
        return GraphService()

    @pytest.mark.asyncio
    async def test_rag_path_events(self, service):
        """测试：RAG 路径的事件序列"""
        async def mock_astream(state, stream_mode=None):
            yield {"orchestrator": {"sub_tasks": [{"domain": "rag", "task": "test"}], "needs_review": False}}
            yield {"rag_bot": {"agent_results": {"rag": {"context": "RAG content", "error": None}}}}
            yield {"reviewer": {"final_answer": "最终回答", "needs_review": False}}

        mock_app = MagicMock()
        mock_app.astream = mock_astream
        service._app = mock_app

        state: AgentState = {
            "user_message": "什么是RAG？",
            "api_key": "test-key",
            "model": "test-model",
        }

        events = []
        async for event in service.run_stream(state):
            events.append(event)

        # 验证事件序列
        # 1. orchestrator running
        assert events[0]["type"] == "status"
        assert events[0]["node"] == "orchestrator"
        assert events[0]["status"] == "running"

        # 2. orchestrator done
        assert events[1]["type"] == "status"
        assert events[1]["node"] == "orchestrator"
        assert events[1]["status"] == "done"
        assert events[1]["data"]["sub_tasks"][0]["domain"] == "rag"

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
        """测试：general 路径的事件序列（跳过 Agent）"""
        async def mock_astream(state, stream_mode=None):
            yield {"orchestrator": {"sub_tasks": [{"domain": "general", "task": "你好"}], "needs_review": False}}
            yield {"reviewer": {"final_answer": "你好！", "needs_review": False}}

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

        # orchestrator done → reviewer running（跳过 Agent）
        assert events[0]["node"] == "orchestrator"
        assert events[0]["status"] == "running"
        assert events[1]["node"] == "orchestrator"
        assert events[1]["status"] == "done"
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
            yield {"orchestrator": {"sub_tasks": [{"domain": "general"}], "needs_review": False}}
            yield {"reviewer": {"final_answer": long_answer, "needs_review": False}}

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
            yield {"orchestrator": {"sub_tasks": [{"domain": "rag"}], "needs_review": False}}
            yield {"rag_bot": {"agent_results": {"rag": {"context": "x"}}}}
            yield {"reviewer": {"final_answer": "ans", "needs_review": False}}

        mock_app = MagicMock()
        mock_app.astream = mock_astream
        service._app = mock_app

        events = []
        async for event in service.run_stream({"user_message": "t", "api_key": "k", "model": "m"}):
            events.append(event)

        # 验证标签
        orchestrator_events = [e for e in events if e.get("node") == "orchestrator"]
        assert orchestrator_events[0]["label"] == "任务分析"

        rag_events = [e for e in events if e.get("node") == "rag_bot"]
        assert rag_events[0]["label"] == "知识检索"

        reviewer_events = [e for e in events if e.get("node") == "reviewer"]
        assert reviewer_events[0]["label"] == "聚合审查"
