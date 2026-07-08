import asyncio
from sqlalchemy import select
from core.database import async_session_maker
from models.database import Lab

async def main():
    async with async_session_maker() as session:
        # 查不同类型的 labs
        stmt = select(Lab).where(Lab.lab_type != "code").limit(5)
        res = await session.execute(stmt)
        labs = res.scalars().all()
        
        print(f"Details of non-code exercises database types:")
        for idx, lab in enumerate(labs):
            print(f"[{idx+1}] Type: {lab.lab_type} | Title: {lab.title}")
            print(f"    test_cases value type: {type(lab.test_cases)}")
            print(f"    test_cases raw value : {lab.test_cases}")
            print("-" * 60)

if __name__ == "__main__":
    asyncio.run(main())
