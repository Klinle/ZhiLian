from importlib import import_module
from typing import AsyncIterable, Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import SecretStr

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

        # Prepare litellm model name (add openai/ prefix when using custom base_url)
        litellm_model = model
        if base_url and not model.startswith("openai/"):
            litellm_model = f"openai/{model}"

        kwargs: Dict[str, Any] = {
            "model": litellm_model,
            "messages": messages,
            "api_key": api_key,
            "stream": True,
        }

        if base_url:
            kwargs["api_base"] = base_url

        if use_tools:
            kwargs["tools"] = tools_service.get_tools()
            kwargs["tool_choice"] = "auto"

        # Call litellm and stream response chunks
        response = await acompletion(**kwargs)

        async for chunk in response:
            try:
                delta = chunk.choices[0].delta
                content = delta.content
                if content:
                    yield _to_text(content)
            except (AttributeError, IndexError, KeyError):
                continue


llm_service = LLMService()
