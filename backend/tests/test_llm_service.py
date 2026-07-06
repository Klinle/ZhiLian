"""
T1 测试：流式 tool_calls 分片累积方法 _collect_tool_calls()
"""
import pytest
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock

from services.llm_service import LLMService
from services.tools_service import tools_service


@pytest.fixture
def service():
    return LLMService()


def _make_tool_call(index, id=None, type=None, name=None, arguments=None):
    """构造模拟的 tool_call 分片对象"""
    func = SimpleNamespace(name=name, arguments=arguments)
    return SimpleNamespace(
        index=index,
        id=id,
        type=type,
        function=func,
    )


class TestCollectToolCalls:
    """_collect_tool_calls 方法测试"""

    def test_single_tool_call_single_chunk(self, service):
        """测试：单个 tool_call 单个分片完整到达"""
        tc = _make_tool_call(
            0, id="call_001", type="function",
            name="calculator", arguments='{"expression": "2+2"}',
        )
        accumulated: dict = {}
        result = service._collect_tool_calls(accumulated, [tc])

        assert 0 in result
        assert result[0]["id"] == "call_001"
        assert result[0]["type"] == "function"
        assert result[0]["function"]["name"] == "calculator"
        assert result[0]["function"]["arguments"] == '{"expression": "2+2"}'

    def test_single_tool_call_multiple_chunks(self, service):
        """测试：单个 tool_call arguments 分片到达"""
        # 首个分片：id + name + 空 arguments
        tc1 = _make_tool_call(
            0, id="call_002", type="function",
            name="web_search", arguments="",
        )
        # 后续分片1：arguments 部分
        tc2 = _make_tool_call(0, arguments='{"query":')
        # 后续分片2：arguments 部分
        tc3 = _make_tool_call(0, arguments=' "RAG"}')

        accumulated: dict = {}
        accumulated = service._collect_tool_calls(accumulated, [tc1])
        accumulated = service._collect_tool_calls(accumulated, [tc2])
        accumulated = service._collect_tool_calls(accumulated, [tc3])

        assert accumulated[0]["id"] == "call_002"
        assert accumulated[0]["function"]["name"] == "web_search"
        assert accumulated[0]["function"]["arguments"] == '{"query": "RAG"}'

    def test_multiple_tool_calls(self, service):
        """测试：多个 tool_call 同时累积"""
        tc1 = _make_tool_call(
            0, id="call_003", type="function",
            name="calculator", arguments='{"expression": "1+1"}',
        )
        tc2 = _make_tool_call(
            1, id="call_004", type="function",
            name="get_current_datetime", arguments="{}",
        )

        accumulated: dict = {}
        result = service._collect_tool_calls(accumulated, [tc1, tc2])

        assert len(result) == 2
        assert result[0]["function"]["name"] == "calculator"
        assert result[1]["function"]["name"] == "get_current_datetime"

    def test_empty_list(self, service):
        """测试：空列表不修改 accumulated"""
        accumulated = {
            0: {
                "id": "existing",
                "type": "function",
                "function": {"name": "test", "arguments": "{}"},
            },
        }
        result = service._collect_tool_calls(accumulated, [])
        assert result == accumulated

    def test_missing_index_skipped(self, service):
        """测试：缺失 index 的分片被跳过"""
        tc = SimpleNamespace(
            id="call_005",
            type="function",
            function=SimpleNamespace(name="test", arguments="{}"),
        )
        accumulated: dict = {}
        result = service._collect_tool_calls(accumulated, [tc])
        assert len(result) == 0

    def test_partial_fields(self, service):
        """测试：只有 arguments 的分片（无 id/name）"""
        tc = _make_tool_call(0, arguments='{"partial":')
        accumulated: dict = {}
        result = service._collect_tool_calls(accumulated, [tc])

        assert 0 in result
        assert result[0]["id"] == ""  # 默认空
        assert result[0]["function"]["name"] == ""  # 默认空
        assert result[0]["function"]["arguments"] == '{"partial":'


class TestExecuteToolCalls:
    """_execute_tool_calls 方法测试"""

    @pytest.mark.asyncio
    async def test_single_tool_call(self, service):
        """测试：单个工具调用返回 assistant 消息 + tool 消息"""
        tool_calls = {
            0: {
                "id": "call_001",
                "type": "function",
                "function": {
                    "name": "calculator",
                    "arguments": '{"expression": "2+2"}',
                },
            }
        }

        with patch.object(
            tools_service, "execute_tool",
            new_callable=AsyncMock, return_value='{"result": 4}',
        ):
            messages = await service._execute_tool_calls(tool_calls)

        assert len(messages) == 2
        assert messages[0]["role"] == "assistant"
        assert len(messages[0]["tool_calls"]) == 1
        assert messages[0]["tool_calls"][0]["id"] == "call_001"
        assert messages[0]["tool_calls"][0]["function"]["name"] == "calculator"
        assert messages[1]["role"] == "tool"
        assert messages[1]["tool_call_id"] == "call_001"
        assert "4" in messages[1]["content"]

    @pytest.mark.asyncio
    async def test_multiple_tool_calls(self, service):
        """测试：多个工具调用返回 assistant 消息 + 多个 tool 消息"""
        tool_calls = {
            0: {
                "id": "call_001",
                "type": "function",
                "function": {
                    "name": "calculator",
                    "arguments": '{"expression": "2+2"}',
                },
            },
            1: {
                "id": "call_002",
                "type": "function",
                "function": {
                    "name": "get_current_datetime",
                    "arguments": "{}",
                },
            },
        }

        with patch.object(
            tools_service, "execute_tool",
            new_callable=AsyncMock, return_value='{"result": "ok"}',
        ):
            messages = await service._execute_tool_calls(tool_calls)

        assert len(messages) == 3  # 1 assistant + 2 tool
        assert messages[0]["role"] == "assistant"
        assert len(messages[0]["tool_calls"]) == 2
        assert messages[1]["role"] == "tool"
        assert messages[1]["tool_call_id"] == "call_001"
        assert messages[2]["role"] == "tool"
        assert messages[2]["tool_call_id"] == "call_002"

    @pytest.mark.asyncio
    async def test_invalid_json_arguments(self, service):
        """测试：无效 JSON 参数使用空字典"""
        tool_calls = {
            0: {
                "id": "call_001",
                "type": "function",
                "function": {
                    "name": "calculator",
                    "arguments": "invalid json",
                },
            }
        }

        with patch.object(
            tools_service, "execute_tool",
            new_callable=AsyncMock, return_value='{"result": "ok"}',
        ) as mock_execute:
            messages = await service._execute_tool_calls(tool_calls)

        # 验证 execute_tool 被调用时使用了空字典
        mock_execute.assert_called_once_with("calculator", {})
        assert len(messages) == 2

    @pytest.mark.asyncio
    async def test_tool_execution_error(self, service):
        """测试：工具执行异常返回错误消息"""
        tool_calls = {
            0: {
                "id": "call_001",
                "type": "function",
                "function": {
                    "name": "web_search",
                    "arguments": '{"query": "test"}',
                },
            }
        }

        with patch.object(
            tools_service, "execute_tool",
            new_callable=AsyncMock,
            side_effect=Exception("Network error"),
        ):
            messages = await service._execute_tool_calls(tool_calls)

        assert len(messages) == 2
        assert messages[1]["role"] == "tool"
        assert "Error" in messages[1]["content"]
        assert "Network error" in messages[1]["content"]

    @pytest.mark.asyncio
    async def test_empty_arguments(self, service):
        """测试：空 arguments 字符串使用空字典"""
        tool_calls = {
            0: {
                "id": "call_001",
                "type": "function",
                "function": {
                    "name": "get_current_datetime",
                    "arguments": "",
                },
            }
        }

        with patch.object(
            tools_service, "execute_tool",
            new_callable=AsyncMock,
            return_value='{"datetime": "2024-01-01"}',
        ) as mock_execute:
            messages = await service._execute_tool_calls(tool_calls)

        mock_execute.assert_called_once_with("get_current_datetime", {})
        assert len(messages) == 2
