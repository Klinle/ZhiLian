"""认证与权限依赖 — 所有 API 统一注入 current_user"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import jwt

from core.database import get_session
from models.database import User
from core.security import SECRET_KEY, ALGORITHM

security_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """从 JWT Token 解析当前用户"""
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    stmt = select(User).where(User.username == username)
    result = await session.execute(stmt)
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user


async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """要求管理员权限"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user


async def get_teacher_or_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """要求教师或管理员权限"""
    if current_user.role not in ("admin", "teacher"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要教师或管理员权限",
        )
    return current_user
