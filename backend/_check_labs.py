import asyncio
from core.database import async_session_maker
from models.database import Lab
from sqlalchemy import select, func

async def check():
    async with async_session_maker() as s:
        t = (await s.execute(select(func.count(Lab.id)))).scalar()
        d = (await s.execute(
            select(Lab.lab_type, func.count(Lab.id)).group_by(Lab.lab_type)
        )).all()
        print(f"Total labs: {t}")
        for r in d:
            print(f"  {r[0]}: {r[1]}")

asyncio.run(check())
