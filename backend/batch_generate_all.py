"""批量出题脚本 — 为 34 个 learning_path 节点各生成 5 种题型（quiz/match/arrange/fill/code）

使用方式：
  cd backend
  python batch_generate_all.py
"""
import asyncio
import time
from sqlalchemy import select
from core.database import async_session_maker
from core.config import settings
from models.database import KnowledgeNode, Lab, DocumentChunk
from services.evaluation_service import evaluation_service


# 5 种题型各生成 1 道
EXERCISE_TYPES = ["quiz", "match", "arrange", "fill", "code"]
DIFFICULTY = "medium"


async def get_domain_context(session, node: KnowledgeNode) -> str:
    """检索该节点所属 category 下所有文档分块，拼接为知识库上下文"""
    domain_node_ids_stmt = select(KnowledgeNode.id).where(
        KnowledgeNode.category == node.category
    )
    result = await session.execute(domain_node_ids_stmt)
    domain_ids = [row[0] for row in result.all()]

    if not domain_ids:
        return ""

    chunk_stmt = (
        select(DocumentChunk.content)
        .where(DocumentChunk.node_id.in_(domain_ids))
        .order_by(DocumentChunk.chunk_index)
        .limit(5)
    )
    chunk_result = await session.execute(chunk_stmt)
    chunks = chunk_result.scalars().all()
    return "\n\n---\n\n".join(c[:2000] for c in chunks if c) if chunks else ""


async def generate_one(
    node: KnowledgeNode,
    exercise_type: str,
    knowledge_context: str,
    api_key: str,
    model: str,
    base_url: str,
) -> dict | None:
    """为单个节点生成一道题，返回结果或 None"""
    try:
        res = await evaluation_service.generate_targeted_exercise(
            node_name=node.name,
            node_description=node.description or "",
            node_category=node.category or "",
            proficiency=0.5,
            is_lighted=False,
            exercise_type=exercise_type,
            difficulty=DIFFICULTY,
            api_key=api_key,
            model=model,
            base_url=base_url,
            learning_state="weak",
            knowledge_context=knowledge_context,
        )
        if "error" in res:
            return {"type": exercise_type, "error": res["error"]}
        return {"type": exercise_type, "data": res}
    except Exception as e:
        return {"type": exercise_type, "error": str(e)}


async def main():
    api_key = settings.DEEPSEEK_API_KEY
    base_url = settings.DEEPSEEK_BASE_URL
    model = settings.DEEPSEEK_MODEL

    if not api_key:
        print("[ERROR] DEEPSEEK_API_KEY not set in .env")
        return

    total_expected = 34 * len(EXERCISE_TYPES)
    print(f"API: {base_url} / Model: {model}")
    print(f"Exercise types: {', '.join(EXERCISE_TYPES)}")
    print(f"Total expected: 34 nodes x {len(EXERCISE_TYPES)} types = {total_expected} labs")
    print(f"Difficulty: {DIFFICULTY}")
    print("=" * 60)

    async with async_session_maker() as session:
        result = await session.execute(
            select(KnowledgeNode)
            .where(KnowledgeNode.source == "learning_path")
            .order_by(KnowledgeNode.category, KnowledgeNode.code)
        )
        nodes = result.scalars().all()
        print(f"Found {len(nodes)} learning_path nodes\n")

        total_saved = 0
        total_failed = 0
        start_time = time.time()

        for i, node in enumerate(nodes):
            cat = node.category or "unknown"
            elapsed = time.time() - start_time
            print(f"[{i+1:2d}/{len(nodes)}] {node.code:12s} ({cat:14s}) | elapsed {elapsed:.0f}s", flush=True)

            knowledge_context = await get_domain_context(session, node)

            # 并发生成 5 种题型
            tasks = [
                generate_one(node, et, knowledge_context, api_key, model, base_url)
                for et in EXERCISE_TYPES
            ]
            results = await asyncio.gather(*tasks)

            node_saved = 0
            node_failed = 0
            for r in results:
                if r is None or "error" in r:
                    node_failed += 1
                    total_failed += 1
                    err_msg = r.get("error", "unknown") if r else "None"
                    print(f"  [FAIL] {r['type'] if r else '?'}: {err_msg[:80]}")
                    continue

                res_data = r["data"]
                lab = Lab(
                    title=res_data.get("title", f"{node.name} - {r['type']}"),
                    description=res_data.get("description", ""),
                    starter_code=res_data.get("starter_code", "") or None,
                    test_cases=res_data.get("test_cases", {}),
                    node_id=node.id,
                    difficulty=DIFFICULTY,
                    lab_type=r["type"],
                    detailed_explanation=res_data.get("detailed_explanation", ""),
                )
                session.add(lab)
                node_saved += 1

            total_saved += node_saved
            types_ok = ",".join(
                r["type"] for r in results if r and "error" not in r
            )
            print(f"  [OK] saved={node_saved} types=[{types_ok}]")

            # 每 5 个节点提交一次，避免事务过大
            if (i + 1) % 5 == 0:
                await session.commit()
                print(f"  --- checkpoint committed ({i+1} nodes) ---")

        # 最终提交
        await session.commit()

    elapsed_total = time.time() - start_time
    print("=" * 60)
    print(f"DONE in {elapsed_total:.1f}s: saved {total_saved}/{total_expected}, failed {total_failed}")


if __name__ == "__main__":
    asyncio.run(main())
