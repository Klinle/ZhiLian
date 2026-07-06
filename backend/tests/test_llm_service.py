"""
T1 测试：流式 tool_calls 分片累积方法 _collect_tool_calls()
"""
import pytest
from types import SimpleNamespace

from services.llm_service import LLMService


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
