"""管理后台 API — 统计、用户、学员、文档、Lab、Agent 管理"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime

from core.database import get_session
from core.dependencies import get_admin_user, get_teacher_or_admin_user
from models.database import (
    User,
    Document,
    Conversation,
    UserLabSubmission,
    Lab,
    Agent,
    KnowledgeNode,
    UserKnowledgeState,
    Memory,
)
from services.profile_service import profile_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── Schemas ────────────────────────────────────────────────

class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    nickname: Optional[str] = None


class DocumentUpdateRequest(BaseModel):
    visibility: Optional[str] = None  # private/shared
    is_active: Optional[int] = None  # 1: 启用, 0: 禁用


class LabCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    starter_code: Optional[str] = None
    test_cases: Optional[dict] = None
    node_id: Optional[str] = None
    difficulty: Optional[str] = "medium"
    lab_type: Optional[str] = "code"
    detailed_explanation: Optional[str] = None


class LabUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    starter_code: Optional[str] = None
    test_cases: Optional[dict] = None
    node_id: Optional[str] = None
    difficulty: Optional[str] = None
    lab_type: Optional[str] = None
    detailed_explanation: Optional[str] = None


class AgentCreateRequest(BaseModel):
    name: str
    role_type: str = "rag_mentor"
    system_prompt: str
    description: Optional[str] = None


class AgentUpdateRequest(BaseModel):
    name: Optional[str] = None
    role_type: Optional[str] = None
    system_prompt: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[int] = None


# ─── Stats ──────────────────────────────────────────────────

@router.get("/stats")
async def get_admin_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """用户数/文档数/对话数/实验提交数"""
    user_count = (await session.execute(select(func.count(User.id)))).scalar() or 0
    doc_count = (await session.execute(select(func.count(Document.id)))).scalar() or 0
    conv_count = (await session.execute(select(func.count(Conversation.id)))).scalar() or 0
    sub_count = (await session.execute(select(func.count(UserLabSubmission.id)))).scalar() or 0
    lab_count = (await session.execute(select(func.count(Lab.id)))).scalar() or 0
    agent_count = (await session.execute(select(func.count(Agent.id)))).scalar() or 0

    return {
        "users": user_count,
        "documents": doc_count,
        "conversations": conv_count,
        "submissions": sub_count,
        "labs": lab_count,
        "agents": agent_count,
    }


# ─── Users ──────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """用户列表"""
    result = await session.execute(
        select(User).order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "nickname": u.nickname or "",
            "role": u.role,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """用户角色变更"""
    try:
        parsed_id = UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user_id")

    user = await session.get(User, parsed_id)
    if not user:
        raise HTTPException(404, "User not found")

    if request.role:
        if request.role not in ("student", "teacher", "admin"):
            raise HTTPException(400, "Invalid role")
        user.role = request.role
    if request.nickname is not None:
        user.nickname = request.nickname

    await session.commit()
    return {"id": str(user.id), "role": user.role, "nickname": user.nickname}


# ─── Students ───────────────────────────────────────────────

@router.get("/students")
async def list_students(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_teacher_or_admin_user),
):
    """学员学习概览（role=student 的用户）"""
    result = await session.execute(
        select(User).where(User.role == "student").order_by(User.created_at.desc())
    )
    students = result.scalars().all()

    student_list = []
    for s in students:
        # Count lighted nodes
        lighted = (
            await session.execute(
                select(func.count(UserKnowledgeState.id)).where(
                    UserKnowledgeState.user_id == s.id,
                    UserKnowledgeState.is_lighted == 1,
                )
            )
        ).scalar() or 0

        # Count submissions
        subs = (
            await session.execute(
                select(func.count(UserLabSubmission.id)).where(
                    UserLabSubmission.user_id == s.id
                )
            )
        ).scalar() or 0

        # Count passed
        passed = (
            await session.execute(
                select(func.count(UserLabSubmission.id)).where(
                    UserLabSubmission.user_id == s.id,
                    UserLabSubmission.status == "passed",
                )
            )
        ).scalar() or 0

        student_list.append(
            {
                "id": str(s.id),
                "username": s.username,
                "nickname": s.nickname or "",
                "lighted_nodes": lighted,
                "total_submissions": subs,
                "passed_labs": passed,
            }
        )

    return student_list


@router.get("/students/{student_id}/profile")
async def get_student_profile(
    student_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_teacher_or_admin_user),
):
    """学员画像详情"""
    try:
        parsed_id = UUID(student_id)
    except ValueError:
        raise HTTPException(400, "Invalid student_id")

    student = await session.get(User, parsed_id)
    if not student:
        raise HTTPException(404, "Student not found")

    stats = await profile_service.get_stats(session, parsed_id)
    radar = await profile_service.get_radar(session, parsed_id)

    return {
        "id": str(student.id),
        "username": student.username,
        "nickname": student.nickname or "",
        "role": student.role,
        "created_at": student.created_at.isoformat(),
        "stats": stats,
        "radar": radar,
    }


# ─── Documents ──────────────────────────────────────────────

@router.get("/documents")
async def admin_list_documents(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """全局文档列表"""
    result = await session.execute(
        select(Document).order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "file_type": d.file_type,
            "status": d.status,
            "created_at": d.created_at.isoformat(),
            "owner_id": str(d.owner_id) if d.owner_id else None,
            "visibility": d.visibility or "private",
            "is_active": d.is_active if d.is_active is not None else 1,
        }
        for d in docs
    ]


@router.put("/documents/{document_id}")
async def admin_update_document(
    document_id: str,
    request: DocumentUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """切换文档 visibility"""
    try:
        parsed_id = UUID(document_id)
    except ValueError:
        raise HTTPException(400, "Invalid document_id")

    doc = await session.get(Document, parsed_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    if request.visibility:
        if request.visibility not in ("private", "shared"):
            raise HTTPException(400, "Invalid visibility")
        doc.visibility = request.visibility

    if request.is_active is not None:
        if request.is_active not in (0, 1):
            raise HTTPException(400, "Invalid is_active value")
        doc.is_active = request.is_active

    await session.commit()
    return {"id": str(doc.id), "visibility": doc.visibility, "is_active": doc.is_active}


# ─── Labs CRUD ──────────────────────────────────────────────

@router.get("/labs")
async def admin_list_labs(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """Lab 列表"""
    result = await session.execute(select(Lab).order_by(Lab.created_at.desc()))
    labs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "title": l.title,
            "description": l.description or "",
            "difficulty": l.difficulty,
            "lab_type": l.lab_type,
            "node_id": str(l.node_id) if l.node_id else None,
        }
        for l in labs
    ]


@router.post("/labs")
async def admin_create_lab(
    request: LabCreateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """创建 Lab"""
    node_id = None
    if request.node_id:
        try:
            node_id = UUID(request.node_id)
        except ValueError:
            raise HTTPException(400, "Invalid node_id")

    lab = Lab(
        title=request.title,
        description=request.description,
        starter_code=request.starter_code,
        test_cases=request.test_cases,
        node_id=node_id,
        difficulty=request.difficulty or "medium",
        lab_type=request.lab_type or "code",
        detailed_explanation=request.detailed_explanation,
    )
    session.add(lab)
    await session.commit()
    return {"id": str(lab.id), "title": lab.title}


@router.put("/labs/{lab_id}")
async def admin_update_lab(
    lab_id: str,
    request: LabUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """更新 Lab"""
    try:
        parsed_id = UUID(lab_id)
    except ValueError:
        raise HTTPException(400, "Invalid lab_id")

    lab = await session.get(Lab, parsed_id)
    if not lab:
        raise HTTPException(404, "Lab not found")

    if request.title is not None:
        lab.title = request.title
    if request.description is not None:
        lab.description = request.description
    if request.starter_code is not None:
        lab.starter_code = request.starter_code
    if request.test_cases is not None:
        lab.test_cases = request.test_cases
    if request.difficulty is not None:
        lab.difficulty = request.difficulty
    if request.lab_type is not None:
        lab.lab_type = request.lab_type
    if request.detailed_explanation is not None:
        lab.detailed_explanation = request.detailed_explanation
    if request.node_id is not None:
        try:
            lab.node_id = UUID(request.node_id) if request.node_id else None
        except ValueError:
            pass

    await session.commit()
    return {"id": str(lab.id), "title": lab.title}


@router.delete("/labs/{lab_id}")
async def admin_delete_lab(
    lab_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """删除 Lab"""
    try:
        parsed_id = UUID(lab_id)
    except ValueError:
        raise HTTPException(400, "Invalid lab_id")

    lab = await session.get(Lab, parsed_id)
    if not lab:
        raise HTTPException(404, "Lab not found")

    await session.delete(lab)
    await session.commit()
    return {"message": "Lab deleted"}


# ─── Agents CRUD ────────────────────────────────────────────

@router.get("/agents")
async def admin_list_agents(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """Agent 列表"""
    result = await session.execute(select(Agent).order_by(Agent.created_at.desc()))
    agents = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "role_type": a.role_type,
            "system_prompt": a.system_prompt,
            "description": a.description or "",
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat(),
        }
        for a in agents
    ]


@router.post("/agents")
async def admin_create_agent(
    request: AgentCreateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """创建 Agent"""
    agent = Agent(
        name=request.name,
        role_type=request.role_type,
        system_prompt=request.system_prompt,
        description=request.description,
    )
    session.add(agent)
    await session.commit()
    return {"id": str(agent.id), "name": agent.name}


@router.put("/agents/{agent_id}")
async def admin_update_agent(
    agent_id: str,
    request: AgentUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """更新 Agent"""
    try:
        parsed_id = UUID(agent_id)
    except ValueError:
        raise HTTPException(400, "Invalid agent_id")

    agent = await session.get(Agent, parsed_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    if request.name is not None:
        agent.name = request.name
    if request.role_type is not None:
        agent.role_type = request.role_type
    if request.system_prompt is not None:
        agent.system_prompt = request.system_prompt
    if request.description is not None:
        agent.description = request.description
    if request.is_active is not None:
        agent.is_active = request.is_active

    await session.commit()
    return {"id": str(agent.id), "name": agent.name}
