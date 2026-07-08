"""题目批量导入脚本 — 读取 JSON 文件，校验后批量写入 labs 表

使用方式：
  cd backend
  python import_labs.py --file ../docs/all_labs_export.json
  python import_labs.py --file ../docs/all_labs_export.json --dry-run    # 只校验不入库
  python import_labs.py --file ../docs/all_labs_export.json --skip-dup   # 跳过已存在的题目
"""
import asyncio
import json
import argparse
import time
import sys
from pathlib import Path

from sqlalchemy import select
from core.database import async_session_maker
from models.database import Lab, KnowledgeNode


# ── 校验规则 ────────────────────────────────────────────────

VALID_LAB_TYPES = {"code", "quiz", "match", "arrange", "fill"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

# 必填字段（starter_code 仅 code 题必填，但允许空字符串）
REQUIRED_FIELDS = ["title", "description", "lab_type", "node_code", "difficulty", "test_cases", "detailed_explanation"]


def validate_lab(lab: dict, index: int) -> list[str]:
    """校验单道题，返回错误信息列表（空列表表示通过）"""
    errors = []

    # 1. 必填字段检查
    for field in REQUIRED_FIELDS:
        if field not in lab:
            errors.append(f"缺少必填字段: {field}")
        elif not lab[field] and field != "starter_code":
            errors.append(f"字段 {field} 为空")

    if errors:
        return errors

    # 2. lab_type 校验
    lab_type = lab.get("lab_type", "")
    if lab_type not in VALID_LAB_TYPES:
        errors.append(f"lab_type 无效: '{lab_type}'，允许值: {VALID_LAB_TYPES}")

    # 3. difficulty 校验
    difficulty = lab.get("difficulty", "")
    if difficulty not in VALID_DIFFICULTIES:
        errors.append(f"difficulty 无效: '{difficulty}'，允许值: {VALID_DIFFICULTIES}")

    # 4. starter_code 检查（code 题必须有值）
    if lab_type == "code":
        starter = lab.get("starter_code", "")
        if not starter or starter.strip() == "":
            errors.append("code 题的 starter_code 不能为空")

    # 5. test_cases 结构校验（按题型）
    tc = lab.get("test_cases", {})
    if not isinstance(tc, dict):
        errors.append("test_cases 必须是 JSON 对象")
        return errors

    if lab_type == "quiz":
        questions = tc.get("questions")
        if not isinstance(questions, list) or len(questions) == 0:
            errors.append("quiz 的 test_cases.questions 必须是非空数组")
        else:
            for i, q in enumerate(questions):
                qid = q.get("id", f"?{i}")
                if "text" not in q or not q["text"]:
                    errors.append(f"quiz 题 {qid} 缺少 text")
                opts = q.get("options")
                if not isinstance(opts, list) or len(opts) != 4:
                    errors.append(f"quiz 题 {qid} 的 options 必须是 4 个元素的数组")
                ans = q.get("answer")
                if not isinstance(ans, int) or ans < 0 or ans > 3:
                    errors.append(f"quiz 题 {qid} 的 answer 必须是 0-3 的整数")
                if "explanation" not in q:
                    errors.append(f"quiz 题 {qid} 缺少 explanation")

    elif lab_type == "code":
        if "requirements" not in tc or not tc["requirements"]:
            errors.append("code 的 test_cases 缺少 requirements")
        sio = tc.get("sample_io")
        if not isinstance(sio, list) or len(sio) < 1:
            errors.append("code 的 test_cases.sample_io 必须是非空二维数组")
        else:
            for i, pair in enumerate(sio):
                if not isinstance(pair, list) or len(pair) != 2:
                    errors.append(f"code 的 sample_io[{i}] 必须是 [输入, 输出] 格式")

    elif lab_type == "match":
        left = tc.get("left")
        right = tc.get("right")
        pairs = tc.get("pairs")
        if not isinstance(left, list) or len(left) != 4:
            errors.append("match 的 left 必须是 4 个元素的数组")
        if not isinstance(right, list) or len(right) != 4:
            errors.append("match 的 right 必须是 4 个元素的数组")
        if not isinstance(pairs, dict) or len(pairs) != 4:
            errors.append("match 的 pairs 必须是 4 对键值")
        elif isinstance(left, list):
            for key in left:
                if key not in pairs:
                    errors.append(f"match 的 pairs 中缺少 left 元素: '{key}'")
            for val in pairs.values():
                if not isinstance(right, list) or val not in right:
                    errors.append(f"match 的 pairs 值 '{val}' 不在 right 中")

    elif lab_type == "arrange":
        steps = tc.get("steps")
        order = tc.get("correct_order")
        if not isinstance(steps, list) or len(steps) < 4:
            errors.append("arrange 的 steps 必须是至少 4 个元素的数组")
        if not isinstance(order, list):
            errors.append("arrange 的 correct_order 必须是数组")
        elif isinstance(steps, list):
            if len(order) != len(steps):
                errors.append(f"arrange 的 correct_order 长度({len(order)})与 steps 长度({len(steps)})不一致")
            for idx in order:
                if not isinstance(idx, int) or idx < 0 or idx >= len(steps):
                    errors.append(f"arrange 的 correct_order 包含无效索引: {idx}")

    elif lab_type == "fill":
        text = tc.get("text")
        blanks = tc.get("blanks")
        if not isinstance(text, str) or "___" not in text:
            errors.append("fill 的 text 必须包含 ___（三个下划线）标记")
        if not isinstance(blanks, list) or len(blanks) == 0:
            errors.append("fill 的 blanks 必须是非空数组")
        elif isinstance(text, str):
            blank_count = text.count("___")
            if blank_count != len(blanks):
                errors.append(f"fill 的 ___ 出现 {blank_count} 次但 blanks 有 {len(blanks)} 个答案")

    return errors


# ── 导入逻辑 ────────────────────────────────────────────────

async def import_labs(file_path: str, dry_run: bool = False, skip_dup: bool = True):
    """读取 JSON 文件，校验后批量导入 labs 表"""
    # 1. 读取文件
    path = Path(file_path)
    if not path.exists():
        print(f"[ERROR] 文件不存在: {file_path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        labs_data = json.load(f)

    if not isinstance(labs_data, list):
        print("[ERROR] JSON 根节点必须是数组")
        return

    print(f"[INFO] 加载文件: {file_path}")
    print(f"[INFO] 题目总数: {len(labs_data)}")
    print("=" * 60)

    # 2. 逐题校验
    valid_labs = []
    invalid_count = 0
    for i, lab in enumerate(labs_data):
        errors = validate_lab(lab, i)
        if errors:
            invalid_count += 1
            title = lab.get("title", f"第{i+1}题")
            print(f"  [INVALID] {title}")
            for e in errors:
                print(f"    - {e}")
        else:
            valid_labs.append(lab)

    print(f"\n[校验结果] 有效: {len(valid_labs)} / 无效: {invalid_count}")

    if dry_run:
        print("[DRY-RUN] 仅校验模式，不入库")
        return

    if not valid_labs:
        print("[INFO] 没有有效题目可导入")
        return

    # 3. 查询知识节点编码 → UUID 映射
    async with async_session_maker() as session:
        node_result = await session.execute(select(KnowledgeNode))
        all_nodes = node_result.scalars().all()
        node_map = {n.code: n.id for n in all_nodes if n.code}

        print(f"[INFO] 数据库中找到 {len(node_map)} 个知识节点")

        # 4. 检查 node_code 是否都存在
        missing_nodes = set()
        for lab in valid_labs:
            code = lab["node_code"]
            if code not in node_map:
                missing_nodes.add(code)

        if missing_nodes:
            print(f"[WARNING] 以下 node_code 在数据库中不存在: {missing_nodes}")
            # 过滤掉 node_code 不存在的题目
            valid_labs = [lab for lab in valid_labs if lab["node_code"] in node_map]
            print(f"[INFO] 过滤后剩余有效题目: {len(valid_labs)}")

        # 5. 查询已有题目标题（去重用）
        existing_titles = set()
        if skip_dup:
            existing_result = await session.execute(select(Lab.title))
            existing_titles = {row[0] for row in existing_result.all()}
            print(f"[INFO] 数据库中已有 {len(existing_titles)} 道题（用于去重）")

        # 6. 批量插入
        total_saved = 0
        total_skipped = 0
        start_time = time.time()

        for i, lab in enumerate(valid_labs):
            title = lab["title"]

            # 去重检查
            if skip_dup and title in existing_titles:
                total_skipped += 1
                continue

            node_id = node_map.get(lab["node_code"])

            new_lab = Lab(
                title=title,
                description=lab.get("description", ""),
                starter_code=lab.get("starter_code", "") or None,
                test_cases=lab.get("test_cases", {}),
                node_id=node_id,
                difficulty=lab.get("difficulty", "medium"),
                lab_type=lab.get("lab_type", "code"),
                detailed_explanation=lab.get("detailed_explanation", ""),
            )
            session.add(new_lab)
            total_saved += 1
            existing_titles.add(title)  # 防止文件内部重复

            # 每 50 条提交一次
            if (total_saved % 50) == 0:
                await session.commit()
                elapsed = time.time() - start_time
                print(f"  [{total_saved} / {len(valid_labs)}] 已入库 (elapsed {elapsed:.1f}s)", flush=True)

        # 最终提交
        await session.commit()

    elapsed_total = time.time() - start_time
    print("=" * 60)
    print(f"[完成] 入库: {total_saved} / 跳过(重复): {total_skipped} / 校验失败: {invalid_count}")
    print(f"[耗时] {elapsed_total:.1f}s")


# ── 入口 ────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="批量导入题目到 labs 表")
    parser.add_argument("--file", required=True, help="JSON 文件路径")
    parser.add_argument("--dry-run", action="store_true", help="仅校验不入库")
    parser.add_argument("--skip-dup", action="store_true", default=True, help="跳过已存在的题目（默认开启）")
    parser.add_argument("--no-skip-dup", dest="skip_dup", action="store_false", help="不跳过重复题目（覆盖导入）")
    args = parser.parse_args()

    asyncio.run(import_labs(args.file, dry_run=args.dry_run, skip_dup=args.skip_dup))
