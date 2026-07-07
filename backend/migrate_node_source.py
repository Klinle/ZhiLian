"""迁移脚本 — 为 knowledge_nodes.source 字段回填数据

步骤：
1. 安全清空老版本计算机五门课种子节点（避免跟 Python 新节点混杂）
2. 运行 seed_data.py 的注入流程灌入 34 个全新的 Python 魔法冒险节点
3. 用精确 code 列表将 34 个 Python 种子节点标记为 'learning_path'
4. 其余提取节点保持 'extraction'
"""

import asyncio
import os
import sys
from sqlalchemy import select, delete, update
from core.database import init_db, async_session_maker
from models.database import (
    KnowledgeNode, KnowledgeRelation, Lab, UserKnowledgeState,
    UserLabSubmission, DocumentChunk
)

# 34 个全新 Python 种子节点的精确 code
SEED_CODES = [
    # 1. 终端游戏与工具 (6)
    "PY_VAR", "PY_STR_FORMAT", "PY_CONTROL", "PY_CONTAINER", "PY_FUNC", "PY_EXCEPTION",
    # 2. 益智游戏数据 (6)
    "PY_COMPREHENSION", "PY_CLOSURE", "PY_ITERATOR", "PY_CONTEXT", "PY_GC", "PY_META",
    # 3. 街机游戏设计 (5)
    "PY_CLASS", "PY_OOP", "PY_MAGIC", "PY_PROPERTY", "PY_SLOTS",
    # 4. 实时动作并发 (6)
    "PY_IO", "PY_GIL", "PY_THREAD", "PY_PROCESS", "PY_ASYNC", "PY_CONCURRENT",
    # 5. 联机对战服务 (6)
    "PY_SOCKET", "PY_REQUESTS", "PY_FASTAPI", "PY_WSGI_ASGI", "PY_SERIALIZATION", "PY_VENV",
    # 6. 数据与工程 (5)
    "PY_SQLITE", "PY_SQLALCHEMY", "PY_UNITTEST", "PY_NUMPY", "PY_PANDAS",
]


async def migrate_node_source():
    print("[Migration] 1. 同步数据库 Schema（确保 source 列存在）...")
    await init_db()
    print("[Migration] Schema 同步完成。")

    print("[Migration] 2. 清理存量的老课种子节点...")
    async with async_session_maker() as session:
        # 清除以前的 requires 边（防止外键错乱）
        # 旧节点特点：code 不是以 'PY_' 开头的节点
        old_nodes_res = await session.execute(
            select(KnowledgeNode).where(~KnowledgeNode.code.like("PY_%"))
        )
        old_nodes = old_nodes_res.scalars().all()
        
        if old_nodes:
            old_node_ids = [n.id for n in old_nodes]
            print(f"[Migration] 发现 {len(old_nodes)} 个旧节点，执行级联清空...")
            
            # 清除老关联 Labs 提交记录与 Labs
            old_labs_stmt = select(Lab.id).where(Lab.node_id.in_(old_node_ids))
            old_lab_ids = (await session.execute(old_labs_stmt)).scalars().all()
            if old_lab_ids:
                await session.execute(delete(UserLabSubmission).where(UserLabSubmission.lab_id.in_(old_lab_ids)))
                await session.execute(delete(Lab).where(Lab.id.in_(old_lab_ids)))
            
            # 清除进度
            await session.execute(delete(UserKnowledgeState).where(UserKnowledgeState.node_id.in_(old_node_ids)))
            # 解除文档分块关联
            await session.execute(update(DocumentChunk).where(DocumentChunk.node_id.in_(old_node_ids)).values(node_id=None))
            # 清除老关系边
            await session.execute(delete(KnowledgeRelation).where(KnowledgeRelation.source_node_id.in_(old_node_ids)))
            await session.execute(delete(KnowledgeRelation).where(KnowledgeRelation.target_node_id.in_(old_node_ids)))
            # 删除老节点
            await session.execute(delete(KnowledgeNode).where(KnowledgeNode.id.in_(old_node_ids)))
            await session.commit()
            print("[Migration] 存量老课节点清理完毕。")
        else:
            print("[Migration] 无存量老课节点需要清理。")

    print("[Migration] 3. 调用 seed_data 注入全新的 Python 核心节点...")
    # 动态导入 seed_data 并执行数据注入
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from seed_data import seed_all_data
    await seed_all_data()

    print("[Migration] 4. 先将所有节点重置为 source='extraction'...")
    async with async_session_maker() as session:
        await session.execute(
            update(KnowledgeNode).values(source="extraction")
        )
        await session.commit()

    print(f"[Migration] 5. 用精确 code 列表标记 {len(SEED_CODES)} 个 Python 种子节点为 learning_path...")
    async with async_session_maker() as session:
        stmt = (
            update(KnowledgeNode)
            .where(KnowledgeNode.code.in_(SEED_CODES))
            .values(source="learning_path")
        )
        result = await session.execute(stmt)
        await session.commit()
        updated = result.rowcount
        print(f"[Migration] 已将 {updated} 个 Python 种子节点标记为 source='learning_path'")

    # 验证结果
    print("\n[Migration] 6. 验证结果：")
    async with async_session_maker() as session:
        for source_val in ("learning_path", "extraction"):
            count_stmt = select(KnowledgeNode).where(KnowledgeNode.source == source_val)
            count = len((await session.execute(count_stmt)).scalars().all())
            print(f"  source='{source_val}': {count} 个节点")

        # 抽查种子节点
        sample = (await session.execute(
            select(KnowledgeNode).where(KnowledgeNode.code == "PY_VAR")
        )).scalars().first()
        if sample:
            print(f"  抽查 PY_VAR: source='{sample.source}'")

    print("\n[Migration] 迁移完成！")
    print("  - learning_path 节点 → 蜂巢图/图谱展示，构成学习路线")
    print("  - extraction  节点 → 仅供 RAG 问答和管理员出题")


if __name__ == "__main__":
    asyncio.run(migrate_node_source())
