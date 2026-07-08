import json
from importlib import import_module
from typing import AsyncIterable, Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import SecretStr

from core.config import settings
from services.rag_service import rag_service
from services.memory_service import memory_service
from services.tools_service import tools_service

litellm = import_module("litellm")
acompletion = getattr(litellm, "acompletion")


def _to_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


class LLMService:
    """Service for streaming LLM chat responses with optional RAG, memory, and tools."""

    def _collect_tool_calls(
        self,
        accumulated: Dict[int, Dict[str, Any]],
        delta_tool_calls: list,
    ) -> Dict[int, Dict[str, Any]]:
        """
        累积流式响应中的 tool_calls 分片。

        OpenAI 流式响应中，tool_calls 按 index 分片到达：
        - 首个分片包含 id、type、function.name
        - 后续分片只包含 function.arguments 的部分字符串
        本方法按 index 累积组装完整的 tool_call。

        Args:
            accumulated: 已累积的 tool_calls，key=index
            delta_tool_calls: 当前 chunk 的 delta.tool_calls 列表

        Returns:
            更新后的 accumulated 字典
        """
        for tc in delta_tool_calls:
            idx = getattr(tc, "index", None)
            if idx is None:
                continue
            if idx not in accumulated:
                accumulated[idx] = {
                    "id": "",
                    "type": "function",
                    "function": {"name": "", "arguments": ""},
                }
            # id 只在首个分片出现
            tc_id = getattr(tc, "id", None)
            if tc_id:
                accumulated[idx]["id"] = tc_id
            # type 只在首个分片出现
            tc_type = getattr(tc, "type", None)
            if tc_type:
                accumulated[idx]["type"] = tc_type
            # function 字段可能分片到达
            func = getattr(tc, "function", None)
            if func:
                name = getattr(func, "name", None)
                if name:
                    accumulated[idx]["function"]["name"] = name
                args = getattr(func, "arguments", None)
                if args:
                    accumulated[idx]["function"]["arguments"] += args
        return accumulated

    async def _execute_tool_calls(
        self,
        tool_calls: Dict[int, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        执行累积完成的 tool_calls，返回可追加到 messages 的消息列表。

        消息格式：
        1. assistant 消息（含完整 tool_calls 列表）
        2. 每个工具的 tool 消息（用 tool_call_id 关联）

        Args:
            tool_calls: 累积完成的 tool_calls，key=index

        Returns:
            可追加到 messages 的消息列表
        """
        # 按 index 排序，构造标准格式的 tool_calls 列表
        sorted_calls = [tool_calls[k] for k in sorted(tool_calls.keys())]

        assistant_tool_calls = [
            {
                "id": tc["id"],
                "type": tc["type"],
                "function": {
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                },
            }
            for tc in sorted_calls
        ]

        messages: list[dict] = [
            {"role": "assistant", "tool_calls": assistant_tool_calls}
        ]

        # 逐个执行工具，将结果作为 tool 消息追加
        for tc in sorted_calls:
            tool_name = tc["function"]["name"]
            # 解析工具参数（容错处理）
            try:
                arguments = (
                    json.loads(tc["function"]["arguments"])
                    if tc["function"]["arguments"]
                    else {}
                )
            except json.JSONDecodeError:
                arguments = {}

            try:
                result = await tools_service.execute_tool(tool_name, arguments)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result,
                    }
                )
            except Exception as e:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": f"Error executing tool '{tool_name}': {str(e)}",
                    }
                )

        return messages

    async def stream_chat(
        self,
        message: str,
        api_key: str,
        model: str = "deepseek-v4-flash",
        use_rag: bool = False,
        use_memory: bool = False,
        use_tools: bool = False,
        base_url: Optional[str] = None,
        session: Optional[AsyncSession] = None,
        history: Optional[List[Dict[str, str]]] = None,
        use_local_embedding: bool = False,
        user_id: str = None,
        system_prompt: Optional[str] = None,
    ) -> AsyncIterable[str]:
        """Stream chat response from LLM with optional RAG, memory, and tools."""

        # Build system prompt with RAG and memory context
        system_parts: list[str] = []

        # Inject Agent system_prompt if provided (highest priority)
        if system_prompt:
            system_parts.append(system_prompt)

        if use_rag and session:
            try:
                rag_context = await rag_service.get_context_for_query(
                    message,
                    api_key,
                    session,
                    provider="openai",
                    base_url=base_url,
                    use_local=use_local_embedding,
                    user_id=user_id,
                )
                if rag_context:
                    system_parts.append(
                        "以下是知识库中检索到的相关内容（包含来源标注），请基于以下内容回答用户问题，并在回答中适当引用来源：\n\n"
                        + rag_context
                    )
            except Exception as e:
                print(f"[RAG Error] {e}")

        if use_memory and session:
            try:
                memory_context = await memory_service.get_memory_context(
                    message, api_key, session, provider="openai", base_url=base_url,
                    use_local=use_local_embedding, user_id=user_id
                )
                if memory_context:
                    system_parts.append(memory_context)
            except Exception as e:
                print(f"[Memory Error] {e}")

        # Build messages list
        messages: list[Dict[str, str]] = []
        if system_parts:
            messages.append({"role": "system", "content": "\n\n".join(system_parts)})

        # Add conversation history
        if history:
            messages.extend(history)

        # Add current user message
        messages.append({"role": "user", "content": message})

        # 前端未配置 API Key 时，回退到后端 .env 中的系统级密钥
        effective_api_key = api_key or settings.DEEPSEEK_API_KEY
        effective_base_url = base_url or settings.DEEPSEEK_BASE_URL

        # Prepare litellm model name (add openai/ prefix when using custom base_url)
        litellm_model = model or settings.DEEPSEEK_MODEL
        if effective_base_url and not litellm_model.startswith("openai/"):
            litellm_model = f"openai/{litellm_model}"

        kwargs: Dict[str, Any] = {
            "model": litellm_model,
            "messages": messages,
            "api_key": effective_api_key,
            "stream": True,
        }

        if effective_base_url:
            kwargs["api_base"] = effective_base_url

        if use_tools:
            kwargs["tools"] = tools_service.get_tools()
            kwargs["tool_choice"] = "auto"

        # Tool Calling 循环（最大 5 轮，防止无限循环）
        max_tool_rounds = 5
        for _ in range(max_tool_rounds):
            response = await acompletion(**kwargs)

            # 累积当前轮的 tool_calls 分片
            accumulated_tool_calls: Dict[int, Dict[str, Any]] = {}

            async for chunk in response:
                try:
                    delta = chunk.choices[0].delta
                    # 提取文本内容，流式输出给前端
                    content = delta.content
                    if content:
                        yield _to_text(content)
                    # 收集 tool_calls 分片（仅 use_tools 时有效）
                    delta_tc = getattr(delta, "tool_calls", None)
                    if delta_tc:
                        self._collect_tool_calls(accumulated_tool_calls, delta_tc)
                except (AttributeError, IndexError, KeyError):
                    continue

            # 如果没有 tool_calls，正常结束
            if not accumulated_tool_calls:
                break

            # 执行工具，将结果追加到 messages，进入下一轮 LLM 调用
            tool_messages = await self._execute_tool_calls(accumulated_tool_calls)
            messages.extend(tool_messages)


llm_service = LLMService()
