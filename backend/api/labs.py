"""实验 API — Lab 列表、详情、提交评测、提交历史"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID, uuid4

from core.database import get_session
from core.dependencies import get_current_user
from models.database import User, KnowledgeNode, UserKnowledgeState
from models.schemas import (
    LabSubmitRequest,
    GenerateExerciseRequest,
    EvaluateDynamicRequest,
)
from services.lab_service import lab_service
from services.evaluation_service import evaluation_service
from services.knowledge_service import knowledge_service

router = APIRouter(prefix="/api/labs", tags=["labs"])


@router.get("")
async def list_labs(
    lab_type: Optional[str] = Query(None, description="Filter by lab_type: code/quiz"),
    node_id: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取 Lab 列表（可按类型/节点/难度筛选）"""
    return await lab_service.list_labs(session, lab_type, node_id, difficulty)


@router.post("/generate")
async def generate_exercise(
    request: GenerateExerciseRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """AI 动态生成针对性练习 — 基于用户薄弱知识点

    不传 node_id 时自动取推荐薄弱节点；生成的练习不持久化（虚拟 Lab），
    id 用 dynamic- 前缀标记，前端据此在提交时走 /evaluate-dynamic 即时评测。
    """
    node_id = request.node_id
    subject = request.subject

    # 未指定节点且指定了科目 → 在该科目下筛选出用户最薄弱或未开启的节点
    if not node_id and subject:
        stmt = select(KnowledgeNode).where(KnowledgeNode.category == subject)
        nodes = (await session.execute(stmt)).scalars().all()
        if not nodes:
            raise HTTPException(404, f"未找到科目【{subject}】下的任何知识节点")
        
        node_ids = [n.id for n in nodes]
        stmt_states = select(UserKnowledgeState).where(
            UserKnowledgeState.user_id == current_user.id,
            UserKnowledgeState.node_id.in_(node_ids)
        )
        states = (await session.execute(stmt_states)).scalars().all()
        state_map = {s.node_id: s for s in states}
        
        def get_sort_key(node):
            state = state_map.get(node.id)
            if not state:
                return (0, 0.0)
            return (1, state.proficiency)
            
        nodes_sorted = sorted(nodes, key=get_sort_key)
        selected_node = nodes_sorted[0]
        node_id = str(selected_node.id)

    # 未指定节点且未指定科目 → 自动取全局推荐薄弱节点
    elif not node_id:
        recommendations = await knowledge_service.recommend_learning_path(
            session, current_user.id, top_n=1
        )
        if not recommendations:
            raise HTTPException(404, "暂无可推荐的知识点，请先学习基础知识")
        node_id = recommendations[0]["id"]

    try:
        node_uuid = UUID(node_id)
    except ValueError:
        raise HTTPException(400, "Invalid node_id")

    node = await session.get(KnowledgeNode, node_uuid)
    if not node:
        raise HTTPException(404, "Knowledge node not found")

    # 查用户该节点认知状态，用于个性化难度
    stmt = select(UserKnowledgeState).where(
        UserKnowledgeState.user_id == current_user.id,
        UserKnowledgeState.node_id == node_uuid,
    )
    state = (await session.execute(stmt)).scalars().first()
    proficiency = state.proficiency if state else 0.0
    is_lighted = bool(state.is_lighted) if state else False

    exercise = await evaluation_service.generate_targeted_exercise(
        node_name=node.name,
        node_description=node.description or "",
        node_category=node.category or "",
        proficiency=proficiency,
        is_lighted=is_lighted,
        exercise_type=request.exercise_type,
        difficulty=request.difficulty or "medium",
        api_key=request.api_key,
        model=request.model,
        base_url=request.base_url,
    )

    if "error" in exercise:
        raise HTTPException(500, exercise["error"])

    # 组装虚拟 Lab（与 Lab 结构兼容，前端可直接渲染）
    return {
        "id": f"dynamic-{uuid4()}",
        "title": exercise.get("title", f"{node.name} · 针对性练习"),
        "description": exercise.get("description", ""),
        "starter_code": exercise.get("starter_code", ""),
        "test_cases": exercise.get("test_cases", {}),
        "difficulty": exercise.get("difficulty", request.difficulty or "medium"),
        "lab_type": exercise.get("lab_type", request.exercise_type),
        "node_id": node_id,
        "node_name": node.name,
        "is_dynamic": True,
    }


@router.post("/evaluate-dynamic")
async def evaluate_dynamic(
    request: EvaluateDynamicRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """动态生成练习的即时评测 — 不创建 submission 记录，但仍联动知识图谱

    quiz 走程序判分，code 走 LLM 评测；评测后调用 apply_evaluation_result
    点亮薄弱节点或记录薄弱状态。
    """
    exercise = request.exercise
    lab_type = exercise.get("lab_type", "code")

    if lab_type == "quiz":
        test_cases = exercise.get("test_cases", {})
        user_answers = request.answers or {}
        result = evaluation_service.evaluate_quiz_submission(test_cases, user_answers)
    else:
        result = await evaluation_service.evaluate_code_submission(
            title=exercise.get("title", ""),
            description=exercise.get("description", ""),
            starter_code=exercise.get("starter_code", ""),
            test_cases=exercise.get("test_cases", {}),
            user_code=request.code,
            api_key=request.api_key,
            model=request.model,
            base_url=request.base_url,
        )

    # 联动点亮知识节点（通过→点亮，未通过→记薄弱点）
    knowledge_result = None
    if request.node_id:
        try:
            node_uuid = UUID(request.node_id)
            knowledge_result = await knowledge_service.apply_evaluation_result(
                session,
                current_user.id,
                node_uuid,
                result.get("score", 0),
                result.get("status", "error"),
            )
        except Exception as e:
            print(f"[Knowledge Link Error] {e}")

    return {
        "status": result.get("status", "error"),
        "score": result.get("score", 0),
        "feedback": result.get("feedback", ""),
        "evaluation_result": result,
        "knowledge": knowledge_result,
    }


@router.get("/{lab_id}")
async def get_lab(
    lab_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取 Lab 详情（含 starter_code、test_cases）"""
    try:
        parsed_id = UUID(lab_id)
    except ValueError:
        raise HTTPException(400, "Invalid lab_id")

    lab = await lab_service.get_lab(session, parsed_id)
    if not lab:
        raise HTTPException(404, "Lab not found")
    return lab


@router.post("/{lab_id}/submit")
async def submit_lab(
    lab_id: str,
    request: LabSubmitRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """提交答案，自动评测"""
    try:
        parsed_id = UUID(lab_id)
    except ValueError:
        raise HTTPException(400, "Invalid lab_id")

    # Get lab details
    lab = await lab_service.get_lab(session, parsed_id)
    if not lab:
        raise HTTPException(404, "Lab not found")

    # Create submission record
    submission = await lab_service.create_submission(
        session, current_user.id, parsed_id, request.code
    )

    # Evaluate based on lab_type
    if lab.get("lab_type") == "quiz":
        # Quiz: program scoring
        test_cases = lab.get("test_cases", {})
        user_answers = request.answers or {}
        result = evaluation_service.evaluate_quiz_submission(test_cases, user_answers)
    else:
        # Code: LLM evaluation
        result = await evaluation_service.evaluate_code_submission(
            title=lab.get("title", ""),
            description=lab.get("description", ""),
            starter_code=lab.get("starter_code", ""),
            test_cases=lab.get("test_cases", {}),
            user_code=request.code,
            api_key=request.api_key,
            model=request.model,
            base_url=request.base_url,
        )

    # Update submission with results
    await lab_service.update_submission_result(
        session,
        submission.id,
        status=result.get("status", "error"),
        score=result.get("score", 0),
        evaluation_result=result,
        ai_feedback=result.get("feedback", ""),
    )

    # 联动点亮知识节点（通过）或记录薄弱点（未通过）
    knowledge_result = None
    if lab.get("node_id"):
        try:
            node_uuid = UUID(lab["node_id"])
            knowledge_result = await knowledge_service.apply_evaluation_result(
                session,
                current_user.id,
                node_uuid,
                result.get("score", 0),
                result.get("status", "error"),
            )
        except Exception as e:
            print(f"[Knowledge Link Error] {e}")

    return {
        "id": str(submission.id),
        "status": result.get("status", "error"),
        "score": result.get("score", 0),
        "feedback": result.get("feedback", ""),
        "evaluation_result": result,
        "knowledge": knowledge_result,
    }


@router.get("/{lab_id}/submissions")
async def get_submissions(
    lab_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取用户提交历史"""
    try:
        parsed_id = UUID(lab_id)
    except ValueError:
        raise HTTPException(400, "Invalid lab_id")

    return await lab_service.get_submissions(session, current_user.id, parsed_id)
