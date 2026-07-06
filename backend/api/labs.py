"""实验 API — Lab 列表、详情、提交评测、提交历史"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from core.database import get_session
from core.dependencies import get_current_user
from models.database import User
from models.schemas import LabSubmitRequest
from services.lab_service import lab_service
from services.evaluation_service import evaluation_service

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

    return {
        "id": str(submission.id),
        "status": result.get("status", "error"),
        "score": result.get("score", 0),
        "feedback": result.get("feedback", ""),
        "evaluation_result": result,
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
