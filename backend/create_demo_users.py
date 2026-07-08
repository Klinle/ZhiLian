import asyncio
from sqlalchemy import select, delete
from core.database import async_session_maker
from models.database import User, KnowledgeNode, UserKnowledgeState
from core.security import get_password_hash

async def create_or_reset_user(session, username, nickname, role, progress_ratio, nodes):
    # 1. 检查并重置用户账号
    stmt = select(User).where(User.username == username)
    user_res = await session.execute(stmt)
    user = user_res.scalar_one_or_none()
    
    if user:
        print(f"User '{username}' already exists. Cleaning up existing knowledge states...")
        await session.execute(delete(UserKnowledgeState).where(UserKnowledgeState.user_id == user.id))
    else:
        print(f"Creating user '{username}'...")
        user = User(
            username=username,
            hashed_password=get_password_hash("123456"),
            nickname=nickname,
            role=role
        )
        session.add(user)
        await session.flush()  # 分配用户 ID
        
    # 2. 注入学习状态
    total_nodes = len(nodes)
    lit_count = int(total_nodes * progress_ratio)
    
    print(f"Populating progress for '{username}': lighting up {lit_count}/{total_nodes} nodes (ratio={progress_ratio:.1%}).")
    
    for idx, node in enumerate(nodes):
        # 判定当前节点是否属于已点亮的前一半节点
        should_light = idx < lit_count
        
        state = UserKnowledgeState(
            user_id=user.id,
            node_id=node.id,
            proficiency=1.0 if should_light else 0.0,
            pagerank_score=1.0 if should_light else 0.0,
            is_lighted=1 if should_light else 0,
            study_duration=3600 if should_light else 0
        )
        session.add(state)
        
    await session.commit()
    print(f"Successfully processed user '{username}'.")

async def main():
    async with async_session_maker() as session:
        # 获取所有学习路径知识节点
        nodes_stmt = select(KnowledgeNode).where(KnowledgeNode.source == "learning_path").order_by(KnowledgeNode.category, KnowledgeNode.code)
        nodes_res = await session.execute(nodes_stmt)
        nodes = nodes_res.scalars().all()
        
        if not nodes:
            print("[ERROR] No learning_path knowledge nodes found in database. Run seed_data.py first.")
            return
            
        print(f"Found {len(nodes)} learning_path nodes for states enrollment.")
        
        # 1. 注册半程用户 (经验掌握度正好为一半)
        await create_or_reset_user(
            session=session,
            username="student_half",
            nickname="半程探索者 (Half-way Scholar)",
            role="student",
            progress_ratio=0.5,
            nodes=nodes
        )
        
        # 2. 注册通关用户 (经验掌握度为百分百全满)
        await create_or_reset_user(
            session=session,
            username="student_full",
            nickname="全栈通关大师 (Full-stack Master)",
            role="student",
            progress_ratio=1.0,
            nodes=nodes
        )
        
        print("\nAll demo users successfully initialized!")
        print("  - student_half (Password: 123456) -> 50% Progress")
        print("  - student_full (Password: 123456) -> 100% Progress")

if __name__ == "__main__":
    asyncio.run(main())
