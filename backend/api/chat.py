from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import traceback
import json

from models.schemas import ChatRequest, RAGChatRequest
from models.database import User
from services.llm_service import llm_service
from services.conversation_service import conversation_service
from services.memory_service import memory_service
from services.tools_service import tools_service
from services.agent_service import agent_service
from services.graph_service import graph_service, AgentState
from core.database import get_session, async_session_maker
from core.dependencies import get_current_user
import uuid
import asyncio

router = APIRouter(prefix="/api", tags=["chat"])


async def _extract_memories_background(
    conversation_id: str,
    api_key: str,
    provider: str = "openai",
    base_url: str = None,
    use_local_embedding: bool = False,
    user_id: str = None,
):
    """Background task to extract memories from conversation"""
    try:
        async with async_session_maker() as session:
            # Get recent conversation messages
            messages = await conversation_service.get_recent_messages(
                session=session,
                conversation_id=conversation_id,
                limit=10  # Last 10 messages
            )

            if len(messages) < 2:  # Need at least user + assistant
                return

            # Format conversation text
            conversation_text = "\n".join([
                f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
                for m in messages
            ])

            # Extract memories
            extracted = await memory_service.extract_memories_from_conversation(
                conversation_text=conversation_text,
                api_key=api_key,
                session=session,
                provider=provider,
                base_url=base_url,
                use_local=use_local_embedding,
                user_id=user_id,
            )

            if extracted:
                print(f"[Auto Memory] Extracted {len(extracted)} memories from conversation {conversation_id}")

    except Exception as e:
        print(f"[Auto Memory Error] {type(e).__name__}: {e}")


@router.post("/chat")
async def chat(
    request: ChatRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Basic chat with conversation persistence"""
    user_id = str(current_user.id)

    # Agent 自动路由（或手动指定）
    agent_system_prompt = None
    try:
        agent_system_prompt, agent_name = await agent_service.route_agent(
            message=request.message,
            session=session,
            api_key=request.apiKey,
            model=request.model,
            base_url=request.baseUrl,
            agent_id=request.agentId,
        )
        if agent_name:
            print(f"[Agent Router] Routed to: {agent_name}")
    except Exception as e:
        print(f"[Agent Router Error] {e}")

    # 如果指定了 conversation_id，使用持久化对话的上下文
    optimized_context = []
    if request.conversationId:
        optimized_context = await conversation_service.get_optimized_context(
            session=session,
            conversation_id=request.conversationId,
            current_model=request.model,
            user_id=user_id,
        )
        # 保存用户消息
        await conversation_service.add_message(
            session=session,
            conversation_id=request.conversationId,
            role="user",
            content=request.message,
            model=request.model,
            user_id=user_id,
        )

    async def generate():
        assistant_content = ""
        try:
            # 使用优化的上下文（包含摘要+最近消息）
            async for chunk in llm_service.stream_chat(
                message=request.message,
                api_key=request.apiKey,
                model=request.model,
                use_rag=False,
                use_memory=False,
                base_url=request.baseUrl,
                session=session,
                history=optimized_context,
                user_id=user_id,
                system_prompt=agent_system_prompt,
            ):
                assistant_content += chunk
                yield chunk

            # 保存助手回复
            if request.conversationId:
                await conversation_service.add_message(
                    session=session,
                    conversation_id=request.conversationId,
                    role="assistant",
                    content=assistant_content,
                    model=request.model,
                    user_id=user_id,
                )

                # 检查是否需要生成摘要
                should_summary = await conversation_service.should_generate_summary(
                    session=session,
                    conversation_id=request.conversationId,
                    user_id=user_id,
                )
                if should_summary:
                    # 异步生成摘要（不阻塞响应）
                    import asyncio
                    asyncio.create_task(
                        conversation_service.generate_summary(
                            session=session,
                            conversation_id=request.conversationId,
                            api_key=request.apiKey,
                            user_id=user_id,
                        )
                    )

        except Exception as e:
            print(f"[Chat Error] {type(e).__name__}: {e}")
            traceback.print_exc()
            yield f"[ERROR]{str(e)}"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/chat/rag")
async def chat_with_rag(
    request: RAGChatRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Chat with RAG, memory and conversation persistence"""
    user_id = str(current_user.id)

    # Agent 自动路由（或手动指定）
    agent_system_prompt = None
    try:
        agent_system_prompt, agent_name = await agent_service.route_agent(
            message=request.message,
            session=session,
            api_key=request.apiKey,
            model=request.model,
            base_url=request.baseUrl,
            agent_id=request.agentId,
        )
        if agent_name:
            print(f"[Agent Router] Routed to: {agent_name}")
    except Exception as e:
        print(f"[Agent Router Error] {e}")

    # 获取优化的上下文
    optimized_context = []
    if request.conversationId:
        optimized_context = await conversation_service.get_optimized_context(
            session=session,
            conversation_id=request.conversationId,
            current_model=request.model,
            user_id=user_id,
        )
        # 保存用户消息
        await conversation_service.add_message(
            session=session,
            conversation_id=request.conversationId,
            role="user",
            content=request.message,
            model=request.model,
            user_id=user_id,
        )

    async def generate():
        assistant_content = ""
        try:
            async for chunk in llm_service.stream_chat(
                message=request.message,
                api_key=request.apiKey,
                model=request.model,
                use_rag=request.use_rag,
                use_memory=request.use_memory,
                use_tools=request.use_tools,
                base_url=request.baseUrl,
                session=session,
                history=optimized_context,
                use_local_embedding=request.use_local_embedding,
                user_id=user_id,
                system_prompt=agent_system_prompt,
            ):
                assistant_content += chunk
                yield chunk

            # 保存助手回复
            if request.conversationId:
                await conversation_service.add_message(
                    session=session,
                    conversation_id=request.conversationId,
                    role="assistant",
                    content=assistant_content,
                    model=request.model,
                    user_id=user_id,
                )

                # 检查是否需要生成摘要
                should_summary = await conversation_service.should_generate_summary(
                    session=session,
                    conversation_id=request.conversationId,
                    user_id=user_id,
                )
                if should_summary:
                    asyncio.create_task(
                        conversation_service.generate_summary(
                            session=session,
                            conversation_id=request.conversationId,
                            api_key=request.apiKey,
                            user_id=user_id,
                        )
                    )

                # 自动提取记忆（当开启记忆功能时）
                if request.use_memory:
                    asyncio.create_task(
                        _extract_memories_background(
                            conversation_id=request.conversationId,
                            api_key=request.apiKey,
                            provider=request.model.split("-")[0] if "-" in request.model else "openai",
                            base_url=request.baseUrl,
                            use_local_embedding=request.use_local_embedding,
                            user_id=user_id,
                        )
                    )

        except Exception as e:
            print(f"[RAG Chat Error] {type(e).__name__}: {e}")
            traceback.print_exc()
            yield f"[ERROR]{str(e)}"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/chat/graph")
async def chat_with_graph(
    request: RAGChatRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """多 Agent 协同对话（SSE 事件流）

    返回 SSE 格式的事件流：
    - event: status  → 各节点工作状态
    - event: content → 最终回答分块
    - event: done    → 完成信号
    - event: error   → 错误信息
    """
    user_id = str(current_user.id)

    # 获取优化的上下文
    optimized_context = []
    if request.conversationId:
        optimized_context = await conversation_service.get_optimized_context(
            session=session,
            conversation_id=request.conversationId,
            current_model=request.model,
            user_id=user_id,
        )
        # 保存用户消息
        await conversation_service.add_message(
            session=session,
            conversation_id=request.conversationId,
            role="user",
            content=request.message,
            model=request.model,
            user_id=user_id,
        )

    # 构建 AgentState
    state: AgentState = {
        "user_message": request.message,
        "api_key": request.apiKey,
        "model": request.model,
        "base_url": request.baseUrl,
        "session": session,
        "user_id": user_id,
        "messages": optimized_context,
    }

    async def generate():
        assistant_content = ""
        try:
            async for event in graph_service.run_stream(state):
                event_type = event.get("type", "status")
                event_data = json.dumps(event, ensure_ascii=False)
                yield f"event: {event_type}\ndata: {event_data}\n\n"

                # 收集最终回答内容
                if event_type == "content":
                    assistant_content += event.get("text", "")

            # 保存助手回复
            if request.conversationId and assistant_content:
                await conversation_service.add_message(
                    session=session,
                    conversation_id=request.conversationId,
                    role="assistant",
                    content=assistant_content,
                    model=request.model,
                    user_id=user_id,
                )

                # 检查是否需要生成摘要
                should_summary = await conversation_service.should_generate_summary(
                    session=session,
                    conversation_id=request.conversationId,
                    user_id=user_id,
                )
                if should_summary:
                    asyncio.create_task(
                        conversation_service.generate_summary(
                            session=session,
                            conversation_id=request.conversationId,
                            api_key=request.apiKey,
                            user_id=user_id,
                        )
                    )

        except Exception as e:
            print(f"[Graph Chat Error] {type(e).__name__}: {e}")
            traceback.print_exc()
            error_data = json.dumps(
                {"type": "error", "message": str(e)}, ensure_ascii=False
            )
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/tools")
async def list_tools():
    """List available tools for agent"""
    return {
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters
            }
            for tool in tools_service.tools.values()
        ]
    }
