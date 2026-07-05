from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from typing import Optional
import jwt

from core.database import get_session
from models.database import User
from core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    SECRET_KEY,
    ALGORITHM
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security_scheme = HTTPBearer()

# Pydantic schemas
class UserRegister(BaseModel):
    username: str
    password: str
    nickname: Optional[str] = None
    role: Optional[str] = "student"  # student, teacher, admin

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    nickname: Optional[str]
    role: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    session: AsyncSession = Depends(get_session)
) -> User:
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


@router.post("/register", response_model=TokenResponse)
async def register(user_in: UserRegister, session: AsyncSession = Depends(get_session)):
    # 检查用户名是否重复
    stmt = select(User).where(User.username == user_in.username)
    result = await session.execute(stmt)
    if result.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 判定第一个注册用户自动成为 admin
    stmt_count = select(User).limit(1)
    res_count = await session.execute(stmt_count)
    role = user_in.role
    if res_count.scalars().first() is None:
        role = "admin"

    # 哈希加密密码
    hashed_pwd = get_password_hash(user_in.password)
    
    # 创建用户
    new_user = User(
        username=user_in.username,
        hashed_password=hashed_pwd,
        nickname=user_in.nickname or user_in.username,
        role=role
    )
    
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    
    # 生成 Token
    token_data = {"sub": new_user.username, "role": new_user.role}
    access_token = create_access_token(token_data)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(new_user.id),
            "username": new_user.username,
            "nickname": new_user.nickname,
            "role": new_user.role
        }
    }


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, session: AsyncSession = Depends(get_session)):
    stmt = select(User).where(User.username == credentials.username)
    result = await session.execute(stmt)
    user = result.scalars().first()
    
    if user is None or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    token_data = {"sub": user.username, "role": user.role}
    access_token = create_access_token(token_data)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "username": user.username,
            "nickname": user.nickname,
            "role": user.role
        }
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "username": current_user.username,
        "nickname": current_user.nickname,
        "role": current_user.role
    }
