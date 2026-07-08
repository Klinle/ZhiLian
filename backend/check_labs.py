"""快速检查 labs 表中的题目数量和题型分布"""
import asyncio
from sqlalchemy import select, func
from core.database import async_session_maker
from models.database import Lab


async def check():
    async with async_session_maker() as session:
        total = (await session.execute(select(func.count(Lab.id)))).scalar()
        print(f"Total labs: {total}")

        types = (await session.execute(
            select(Lab.lab_type, func.count(Lab.id)).group_by(Lab.lab_type)
        )).all()
        for t, c in types:
            print(f"  {t}: {c}")

        diff = (await session.execute(
            select(Lab.difficulty, func.count(Lab.id)).group_by(Lab.difficulty)
        )).all()
        print("Difficulty:")
        for d, c in diff:
            print(f"  {d}: {c}")


if __name__ == "__main__":
    asyncio.run(check())
