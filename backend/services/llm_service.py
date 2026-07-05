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
    ) -> AsyncIterable[str]:
        """Stream chat response from LLM with optional RAG, memory, and tools."""

        # Build system prompt with RAG and memory context
        system_parts: list[str] = []

        if use_rag and session:
            try:
                rag_context = await rag_service.get_context_for_query(
                    message,
                    api_key,
                    session,
                    provider="openai",
                    base_url=base_url,
                    use_local=use_local_embedding,
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
                    use_local=use_local_embedding
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
