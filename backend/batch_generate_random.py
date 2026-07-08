"""批量随机出题脚本 — 为所有 learning_path 知识节点随机生成 1-3 个不同题型的题目

包含高并发信号量控制与指数退避重试机制，防止 API 触发频率限制 (429) 或网络超时报错。

使用方式：
  cd backend
  python batch_generate_random.py
"""
import asyncio
import time
import random
from sqlalchemy import select
from core.database import async_session_maker
from core.config import settings
from models.database import KnowledgeNode, Lab, DocumentChunk
from services.evaluation_service import evaluation_service

# 5 种题型候选池
EXERCISE_TYPES = ["quiz", "match", "arrange", "fill", "code"]
DIFFICULTY = "medium"

# 并发限制器，防止同一时刻发起过多请求导致 API 拒绝
SEMAPHORE = asyncio.Semaphore(2)


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
    """为单个节点生成一道题，包含指数退避重试逻辑"""
    max_retries = 3
    for attempt in range(1, max_retries + 1):
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
                err_msg = res["error"]
                print(f"  [RETRY {attempt}/{max_retries}] {exercise_type} error: {err_msg[:65]}", flush=True)
                if attempt < max_retries:
                    await asyncio.sleep(3 * attempt)
                    continue
                return {"type": exercise_type, "error": err_msg}
            return {"type": exercise_type, "data": res}
        except Exception as e:
            err_msg = str(e)
            print(f"  [RETRY {attempt}/{max_retries}] {exercise_type} exception: {err_msg[:65]}", flush=True)
            if attempt < max_retries:
                await asyncio.sleep(3 * attempt)
                continue
            return {"type": exercise_type, "error": err_msg}
    return None


async def generate_one_with_sem(
    sem: asyncio.Semaphore,
    node: KnowledgeNode,
    exercise_type: str,
    knowledge_context: str,
    api_key: str,
    model: str,
    base_url: str,
) -> dict | None:
    """受信号量保护的生成方法"""
    async with sem:
        return await generate_one(node, exercise_type, knowledge_context, api_key, model, base_url)


async def main():
    api_key = settings.DEEPSEEK_API_KEY
    base_url = settings.DEEPSEEK_BASE_URL
    model = settings.DEEPSEEK_MODEL

    if not api_key:
        print("[ERROR] DEEPSEEK_API_KEY not set in .env")
        return

    from core.database import engine
    print(f"DATABASE: {engine.url}")
    print(f"API: {base_url} / Model: {model}")
    print(f"Candidate exercise types: {', '.join(EXERCISE_TYPES)}")
    print(f"Concurrency limit: {SEMAPHORE._value}")
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
            
            # 随机决定该节点生成 1-3 道题
            num_questions = random.randint(1, 3)
            selected_types = random.sample(EXERCISE_TYPES, k=num_questions)
            print(f"  -> Randomly selected {num_questions} types: {selected_types}", flush=True)

            # 在并发限制信号量下并发执行
            tasks = [
                generate_one_with_sem(SEMAPHORE, node, et, knowledge_context, api_key, model, base_url)
                for et in selected_types
            ]
            results = await asyncio.gather(*tasks)

            node_saved = 0
            for r in results:
                if r is None or "error" in r:
                    total_failed += 1
                    err_msg = r.get("error", "unknown") if r else "None"
                    print(f"  [FAIL] {r['type'] if r else '?'}: {err_msg[:80]}", flush=True)
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
            print(f"  [OK] saved={node_saved} types=[{types_ok}]", flush=True)

            # 每 3 个节点提交一次，避免写锁定时间过长
            if (i + 1) % 3 == 0:
                await session.commit()
                print(f"  --- checkpoint committed ({i+1} nodes) ---", flush=True)

            # 在节点之间增加微小休眠，以顺滑 API 访问曲线
            await asyncio.sleep(1.2)

        # 最终提交
        await session.commit()

    elapsed_total = time.time() - start_time
    print("=" * 60)
    print(f"DONE in {elapsed_total:.1f}s: saved {total_saved} labs, failed {total_failed}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
