"""管理后台 API — 统计、用户、学员、文档、Lab、Agent 管理"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, case
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime
import asyncio

from core.database import get_session
from core.dependencies import get_admin_user, get_teacher_or_admin_user
from models.database import (
    User,
    Document,
    DocumentChunk,
    Conversation,
    UserLabSubmission,
    Lab,
    Agent,
    KnowledgeNode,
    UserKnowledgeState,
    Memory,
)
from services.profile_service import profile_service
from services.evaluation_service import evaluation_service

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


class LabBatchGenerateRequest(BaseModel):
    node_id: str
    exercise_type: str
    difficulty: Optional[str] = "medium"
    count: Optional[int] = 3
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class LabBatchSaveRequest(BaseModel):
    labs: List[LabCreateRequest]


class LabUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    starter_code: Optional[str] = None
    test_cases: Optional[dict] = None
    node_id: Optional[str] = None
    difficulty: Optional[str] = None
    lab_type: Optional[str] = None
    detailed_explanation: Optional[str] = None


class LabBatchDeleteRequest(BaseModel):
    ids: List[str]


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
    """用户数/文档数/对话数/实验提交数，以及可视化分析数据"""
    user_count = (await session.execute(select(func.count(User.id)))).scalar() or 0
    doc_count = (await session.execute(select(func.count(Document.id)))).scalar() or 0
    conv_count = (await session.execute(select(func.count(Conversation.id)))).scalar() or 0
    sub_count = (await session.execute(select(func.count(UserLabSubmission.id)))).scalar() or 0
    lab_count = (await session.execute(select(func.count(Lab.id)))).scalar() or 0
    agent_count = (await session.execute(select(func.count(Agent.id)))).scalar() or 0

    # 1. 最近 7 天活跃与增长趋势
    from datetime import timedelta
    today = datetime.utcnow().date()
    user_trends = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%m-%d")
        
        user_stmt = select(func.count(User.id)).where(func.date(User.created_at) == day)
        user_cnt = (await session.execute(user_stmt)).scalar() or 0
        
        conv_stmt = select(func.count(Conversation.id)).where(func.date(Conversation.created_at) == day)
        conv_cnt = (await session.execute(conv_stmt)).scalar() or 0
        
        user_trends.append({
            "date": day_str,
            "new_users": user_cnt,
            "active_chats": conv_cnt
        })

    # 2. 知识库分类节点/文档/题目分布
    cat_node_res = (await session.execute(
        select(KnowledgeNode.category, func.count(KnowledgeNode.id)).group_by(KnowledgeNode.category)
    )).all()
    cat_doc_res = (await session.execute(
        select(KnowledgeNode.category, func.count(func.distinct(KnowledgeNode.document_id)))
        .where(KnowledgeNode.document_id.isnot(None)).group_by(KnowledgeNode.category)
    )).all()
    cat_lab_res = (await session.execute(
        select(KnowledgeNode.category, func.count(Lab.id))
        .join(Lab, Lab.node_id == KnowledgeNode.id).group_by(KnowledgeNode.category)
    )).all()

    category_distribution = {}
    for cat, cnt in cat_node_res:
        category_distribution[cat or "other"] = {
            "node_count": cnt,
            "doc_count": 0,
            "lab_count": 0
        }
    for cat, cnt in cat_doc_res:
        c = cat or "other"
        if c not in category_distribution:
            category_distribution[c] = {"node_count": 0, "doc_count": 0, "lab_count": 0}
        category_distribution[c]["doc_count"] = cnt
    for cat, cnt in cat_lab_res:
        c = cat or "other"
        if c not in category_distribution:
            category_distribution[c] = {"node_count": 0, "doc_count": 0, "lab_count": 0}
        category_distribution[c]["lab_count"] = cnt

    # 3. 题型分布与通关数据
    lab_type_res = (await session.execute(
        select(Lab.lab_type, func.count(Lab.id)).group_by(Lab.lab_type)
    )).all()
    sub_stats_res = (await session.execute(
        select(
            Lab.lab_type,
            func.count(UserLabSubmission.id),
            func.sum(case((UserLabSubmission.status == "passed", 1), else_=0))
        ).join(UserLabSubmission, UserLabSubmission.lab_id == Lab.id).group_by(Lab.lab_type)
    )).all()

    lab_type_distribution = {}
    for lt, cnt in lab_type_res:
        lab_type_distribution[lt or "code"] = {
            "count": cnt,
            "submissions": 0,
            "passed": 0
        }
    for lt, sub_cnt, pass_cnt in sub_stats_res:
        l_type = lt or "code"
        if l_type not in lab_type_distribution:
            lab_type_distribution[l_type] = {"count": 0, "submissions": 0, "passed": 0}
        lab_type_distribution[l_type]["submissions"] = sub_cnt
        lab_type_distribution[l_type]["passed"] = int(pass_cnt or 0)

    # 4. 导师 Agent 使用活跃度
    agent_act_res = (await session.execute(
        select(Agent.name, func.count(Conversation.id))
        .join(Conversation, Conversation.agent_id == Agent.id).group_by(Agent.name)
    )).all()
    agent_activity = {}
    for name, cnt in agent_act_res:
        agent_activity[name or "unknown"] = cnt

    return {
        "users": user_count,
        "documents": doc_count,
        "conversations": conv_count,
        "submissions": sub_count,
        "labs": lab_count,
        "agents": agent_count,
        "user_trends": user_trends,
        "category_distribution": category_distribution,
        "lab_type_distribution": lab_type_distribution,
        "agent_activity": agent_activity,
    }


@router.post("/stats/ai-evaluation")
async def get_ai_operation_evaluation(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """根据系统核心度量数据，呼叫大模型输出智能运营诊断评估"""
    # 1. 快速聚合核心运营指标
    user_count = (await session.execute(select(func.count(User.id)))).scalar() or 0
    doc_count = (await session.execute(select(func.count(Document.id)))).scalar() or 0
    conv_count = (await session.execute(select(func.count(Conversation.id)))).scalar() or 0
    sub_count = (await session.execute(select(func.count(UserLabSubmission.id)))).scalar() or 0
    lab_count = (await session.execute(select(func.count(Lab.id)))).scalar() or 0

    cat_node_res = (await session.execute(
        select(KnowledgeNode.category, func.count(KnowledgeNode.id)).group_by(KnowledgeNode.category)
    )).all()
    cat_lab_res = (await session.execute(
        select(KnowledgeNode.category, func.count(Lab.id))
        .join(Lab, Lab.node_id == KnowledgeNode.id).group_by(KnowledgeNode.category)
    )).all()

    sub_stats_res = (await session.execute(
        select(
            Lab.lab_type,
            func.count(UserLabSubmission.id),
            func.sum(case((UserLabSubmission.status == "passed", 1), else_=0))
        ).join(UserLabSubmission, UserLabSubmission.lab_id == Lab.id).group_by(Lab.lab_type)
    )).all()

    agent_act_res = (await session.execute(
        select(Agent.name, func.count(Conversation.id))
        .join(Conversation, Conversation.agent_id == Agent.id).group_by(Agent.name)
    )).all()

    # 2. 格式化为诊断文本供 LLM 理解
    stats_summary = f"""
系统核心概览:
- 注册用户数: {user_count}
- 知识库文档数: {doc_count}
- 互动对话总数: {conv_count}
- 题目总提交数: {sub_count}
- 题库总题目数: {lab_count}

分类覆盖分布 (Category -> 知识节点数 / 题目数):
"""
    for cat, node_cnt in cat_node_res:
        lab_cnt = next((cnt for c, cnt in cat_lab_res if c == cat), 0)
        stats_summary += f"- {cat or '其他'}: {node_cnt} 节点 / {lab_cnt} 题目\n"

    stats_summary += "\n题型答题数据 (题型 -> 总提交 / 通过数):\n"
    for lt, sub_cnt, pass_cnt in sub_stats_res:
        stats_summary += f"- {lt or 'code'}: {sub_cnt} 次提交 / {pass_cnt or 0} 通过\n"

    stats_summary += "\n导师 Agent 对话占比:\n"
    for name, cnt in agent_act_res:
        stats_summary += f"- {name or '未知导师'}: {cnt} 次互动对话\n"

    # 3. 大模型调用
    system_prompt = (
        "你是一个专业的全栈系统运营专家与教学质量评估顾问。你的任务是根据给出的 CogniLink 系统运营统计指标，"
        "分析整个系统的教学内容完备度、学生参与度、导师助教倾向度、学情健康度，并输出一份诊断评分及改进报告。\n\n"
        "请务必遵守以下规范：\n"
        "1. 严格返回 JSON 格式，包含三个字段：\n"
        "   - 'score': 0-100 的整数，表示当前系统运营健康度。\n"
        "   - 'summary': 100-200 字的简要诊断综述。\n"
        "   - 'details': Markdown 格式的详细分析报告，包含内容完备度评估、导师使用评估、下一步优化动作建议等，字数在 500-1000 字左右。\n"
        "2. 绝对不能在任何内容中包含 Emoji 表情符号。\n"
        "3. 完全使用中文。"
    )

    user_prompt = f"以下是当前的系统运营度量统计指标：\n{stats_summary}\n请基于此进行深度智能评估并返回 JSON 数据。"

    try:
        res_json = await evaluation_service._call_llm_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.3,
        )
        return res_json
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 诊断失败: {str(e)}")


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


# ─── Knowledge Nodes ───────────────────────────────────────

@router.get("/knowledge-nodes")
async def admin_list_knowledge_nodes(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """知识节点列表（含素材分块数 + 已有题数 + 题型分布）

    仅返回 learning_path 节点（蜂巢图/图谱展示的 34 个种子节点），
    确保管理员出题时关联的节点在用户端蜂巢图上可见可点亮。
    """
    # 1. 仅查询学习路线种子节点（蜂巢图上展示的节点）
    result_nodes = await session.execute(
        select(KnowledgeNode)
        .where(KnowledgeNode.source == "learning_path")
        .order_by(KnowledgeNode.category, KnowledgeNode.name)
    )
    nodes = result_nodes.scalars().all()

    # 2. 各节点关联的文档分块数
    chunk_stmt = (
        select(DocumentChunk.node_id, func.count(DocumentChunk.id).label("cnt"))
        .where(DocumentChunk.node_id.isnot(None))
        .group_by(DocumentChunk.node_id)
    )
    chunk_result = await session.execute(chunk_stmt)
    chunk_map: dict = {row[0]: row[1] for row in chunk_result.all()}

    # 3. 各节点关联的题目数 + 题型分布
    lab_stmt = (
        select(Lab.node_id, Lab.lab_type, func.count(Lab.id).label("cnt"))
        .where(Lab.node_id.isnot(None))
        .group_by(Lab.node_id, Lab.lab_type)
    )
    lab_result = await session.execute(lab_stmt)
    lab_count_map: dict = {}
    lab_types_map: dict = {}
    for row in lab_result.all():
        nid, ltype, cnt = row[0], row[1], row[2]
        lab_count_map[nid] = lab_count_map.get(nid, 0) + cnt
        if nid not in lab_types_map:
            lab_types_map[nid] = {}
        lab_types_map[nid][ltype] = cnt

    return [
        {
            "id": str(n.id),
            "code": n.code,
            "name": n.name,
            "category": n.category or "",
            "description": n.description or "",
            "pagerank_weight": n.pagerank_weight,
            "chunk_count": chunk_map.get(n.id, 0),
            "lab_count": lab_count_map.get(n.id, 0),
            "lab_types": lab_types_map.get(n.id, {}),
        }
        for n in nodes
    ]


@router.get("/knowledge-nodes/{node_id}/context")
async def admin_get_node_context(
    node_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """知识节点的文档分块上下文预览"""
    try:
        node_uuid = UUID(node_id)
    except ValueError:
        raise HTTPException(400, "Invalid node_id")

    node = await session.get(KnowledgeNode, node_uuid)
    if not node:
        raise HTTPException(404, "Knowledge node not found")

    # 分块总数 + 总字符数
    count_stmt = (
        select(
            func.count(DocumentChunk.id),
            func.coalesce(func.sum(func.length(DocumentChunk.content)), 0),
        )
        .where(DocumentChunk.node_id == node_uuid)
    )
    count_result = await session.execute(count_stmt)
    chunk_count, total_chars = count_result.one()

    # 前 5 个分块预览（与 generate-batch 的检索逻辑保持一致）
    preview_stmt = (
        select(
            DocumentChunk.content,
            DocumentChunk.element_type,
            DocumentChunk.page_number,
        )
        .where(DocumentChunk.node_id == node_uuid)
        .order_by(DocumentChunk.chunk_index)
        .limit(5)
    )
    preview_result = await session.execute(preview_stmt)
    preview_rows = preview_result.all()

    return {
        "chunk_count": chunk_count,
        "total_chars": total_chars,
        "preview_chunks": [
            {
                "content": (content or "")[:300],
                "element_type": element_type,
                "page_number": page_number,
            }
            for content, element_type, page_number in preview_rows
        ],
    }


# ─── Labs CRUD ──────────────────────────────────────────────

@router.get("/labs")
async def admin_list_labs(
    lab_type: Optional[str] = None,
    difficulty: Optional[str] = None,
    node_id: Optional[str] = None,
    search: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """题库列表（支持按题型/难度/节点/标题搜索筛选）"""
    stmt = (
        select(Lab, KnowledgeNode.name, KnowledgeNode.category)
        .outerjoin(KnowledgeNode, Lab.node_id == KnowledgeNode.id)
    )
    if lab_type:
        stmt = stmt.where(Lab.lab_type == lab_type)
    if difficulty:
        stmt = stmt.where(Lab.difficulty == difficulty)
    if node_id:
        try:
            stmt = stmt.where(Lab.node_id == UUID(node_id))
        except ValueError:
            pass
    if search:
        stmt = stmt.where(Lab.title.ilike(f"%{search}%"))
    stmt = stmt.order_by(Lab.created_at.desc())

    result = await session.execute(stmt)
    rows = result.all()
    return [
        {
            "id": str(l.id),
            "title": l.title,
            "description": l.description or "",
            "difficulty": l.difficulty,
            "lab_type": l.lab_type,
            "node_id": str(l.node_id) if l.node_id else None,
            "node_name": node_name or "",
            "node_category": node_category or "",
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "has_explanation": bool(l.detailed_explanation),
        }
        for l, node_name, node_category in rows
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


@router.post("/labs/batch-delete")
async def admin_batch_delete_labs(
    request: LabBatchDeleteRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """批量删除 Lab"""
    parsed_ids = []
    for lab_id in request.ids:
        try:
            parsed_ids.append(UUID(lab_id))
        except ValueError:
            raise HTTPException(400, f"Invalid lab_id: {lab_id}")

    # 批量查询并删除
    stmt = select(Lab).where(Lab.id.in_(parsed_ids))
    result = await session.execute(stmt)
    labs = result.scalars().all()

    for lab in labs:
        await session.delete(lab)

    await session.commit()
    return {"message": f"Successfully deleted {len(labs)} labs"}


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


@router.post("/labs/generate-batch")
async def admin_generate_batch_labs(
    request: LabBatchGenerateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """AI 并发批量出题"""
    try:
        node_uuid = UUID(request.node_id)
    except ValueError:
        raise HTTPException(400, "Invalid node_id")

    node = await session.get(KnowledgeNode, node_uuid)
    if not node:
        raise HTTPException(404, "Knowledge node not found")

    # 按领域检索文档分块：选中节点可能无直接关联分块（learning_path 种子节点），
    # 改为检索该节点所属 category 下所有 extraction 节点关联的分块，覆盖更全面
    domain_node_ids_stmt = (
        select(KnowledgeNode.id)
        .where(KnowledgeNode.category == node.category)
    )
    domain_node_ids_result = await session.execute(domain_node_ids_stmt)
    domain_node_ids = [row[0] for row in domain_node_ids_result.all()]

    if domain_node_ids:
        chunk_stmt = (
            select(DocumentChunk.content)
            .where(DocumentChunk.node_id.in_(domain_node_ids))
            .order_by(DocumentChunk.chunk_index)
            .limit(5)
        )
        chunk_result = await session.execute(chunk_stmt)
        chunk_contents = chunk_result.scalars().all()
    else:
        chunk_contents = []
    knowledge_context = "\n\n---\n\n".join(
        content[:2000] for content in chunk_contents if content
    ) if chunk_contents else ""

    tasks = []
    for _ in range(request.count or 3):
        tasks.append(
            evaluation_service.generate_targeted_exercise(
                node_name=node.name,
                node_description=node.description or "",
                node_category=node.category or "",
                proficiency=0.5,
                is_lighted=False,
                exercise_type=request.exercise_type,
                difficulty=request.difficulty or "medium",
                api_key=request.api_key,
                model=request.model,
                base_url=request.base_url,
                learning_state="weak",  # 管理员批量出题：通用难度，不注入用户画像
                knowledge_context=knowledge_context,  # 注入知识库文档上下文
            )
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    generated_labs = []
    for res in results:
        if isinstance(res, Exception):
            print(f"[Batch Generate Warning] Task failed: {res}")
            continue
        if "error" in res:
            print(f"[Batch Generate Warning] LLM returned error: {res['error']}")
            continue

        generated_labs.append({
            "title": res.get("title", f"{node.name} · 自适应练习"),
            "description": res.get("description", ""),
            "starter_code": res.get("starter_code", ""),
            "test_cases": res.get("test_cases", {}),
            "difficulty": res.get("difficulty", request.difficulty or "medium"),
            "lab_type": res.get("lab_type", request.exercise_type),
            "detailed_explanation": res.get("detailed_explanation") or res.get("explanation", ""),
            "node_id": request.node_id,
        })

    return {
        "labs": generated_labs,
        "context_info": {
            "node_name": node.name,
            "chunk_count": len(chunk_contents),
            "context_length": len(knowledge_context),
        },
    }


@router.post("/labs/batch-save")
async def admin_batch_save_labs(
    request: LabBatchSaveRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_admin_user),
):
    """批量导入 Lab"""
    created_labs = []
    for item in request.labs:
        node_id = None
        if item.node_id:
            try:
                node_id = UUID(item.node_id)
            except ValueError:
                pass

        lab = Lab(
            title=item.title,
            description=item.description,
            starter_code=item.starter_code,
            test_cases=item.test_cases,
            node_id=node_id,
            difficulty=item.difficulty or "medium",
            lab_type=item.lab_type or "code",
            detailed_explanation=item.detailed_explanation,
        )
        session.add(lab)
        created_labs.append(lab)

    await session.commit()
    return {"count": len(created_labs), "labs": [{"id": str(l.id), "title": l.title} for l in created_labs]}

