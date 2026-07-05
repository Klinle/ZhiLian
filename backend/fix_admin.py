"""
fix_admin.py
------------
用途：确保数据库中 Kleinle 账号存在且角色为 admin。
用法：在 backend/ 目录下激活 venv 后运行：
    python fix_admin.py
"""
import asyncio
from sqlalchemy import select
from core.database import async_session_maker
from models.database import User
from core.security import get_password_hash

ADMIN_USERNAME = "Kleinle"
ADMIN_PASSWORD = "123456"
ADMIN_NICKNAME = "Kleinle (SuperAdmin)"

async def fix_admin():
    async with async_session_maker() as session:
        stmt = select(User).where(User.username == ADMIN_USERNAME)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if user is None:
            # 不存在则新建
            user = User(
                username=ADMIN_USERNAME,
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                nickname=ADMIN_NICKNAME,
                role="admin"
            )
            session.add(user)
            await session.commit()
            print(f"[fix_admin] User '{ADMIN_USERNAME}' created with role=admin.")
        else:
            # 存在则确保角色为 admin 并更新密码
            user.role = "admin"
            user.nickname = ADMIN_NICKNAME
            user.hashed_password = get_password_hash(ADMIN_PASSWORD)
            await session.commit()
            print(f"[fix_admin] User '{ADMIN_USERNAME}' updated to role=admin.")

if __name__ == "__main__":
    asyncio.run(fix_admin())
