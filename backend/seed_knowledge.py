"""知识库初始化导入脚本 — 预加载 Python 官方权威 Markdown 教程并生成本地 BGE-M3 向量嵌入

运行方式：
  cd backend
  python seed_knowledge.py
"""

import asyncio
import os
import sys
from uuid import UUID
from sqlalchemy import select, delete

# 添加 backend 到系统寻包路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import async_session_maker, init_db
from models.database import Document, DocumentChunk, User
from services.document_service import document_service
from services.embedding_service import embedding_service


# 待导入的文件与标题定义
KNOWLEDGE_FILES = [
    {
        "filename": "python_basics_tutorial.md",
        "title": "Python 基础语法与核心机制权威参考"
    },
    {
        "filename": "python_oop_and_magic.md",
        "title": "Python 面向对象高级编程与魔术方法"
    },
    {
        "filename": "python_concurrency_and_gil.md",
        "title": "Python 并发编程与全局解释器锁 (GIL)"
    },
    {
        "filename": "python_pep8_standards.md",
        "title": "Python 编程规范 (PEP 8) 与测试工程实践"
    }
]

async def seed_knowledge():
    print("[KnowledgeSeed] 1. 同步数据库 Schema...")
    await init_db()

    async with async_session_maker() as session:
        # 获取系统超级管理员 Kleinle 的 ID 作为 Owner
        admin_res = await session.execute(select(User).where(User.username == "Kleinle"))
        admin_user = admin_res.scalar_one_or_none()
        owner_id = admin_user.id if admin_user else None
        
        if not owner_id:
            print("[KnowledgeSeed] 警告: 未找到超级管理员 Kleinle 账号，将使用空 owner_id 导入。")

        # 检查知识库文件夹
        base_dir = os.path.dirname(os.path.abspath(__file__))
        kb_dir = os.path.join(base_dir, "knowledge_base")
        if not os.path.exists(kb_dir):
            print(f"[KnowledgeSeed] 错误: 未找到知识库目录 {kb_dir}")
            return

        for kfile in KNOWLEDGE_FILES:
            file_path = os.path.join(kb_dir, kfile["filename"])
            if not os.path.exists(file_path):
                print(f"[KnowledgeSeed] 警告: 未找到文件 {file_path}，跳过该项。")
                continue

            print(f"\n[KnowledgeSeed] 开始导入: {kfile['title']} ({kfile['filename']})...")
            
            # 安全清理已存在的同名预加载文档
            existing_doc_res = await session.execute(
                select(Document).where(Document.title == kfile["title"])
            )
            existing_doc = existing_doc_res.scalar_one_or_none()
            if existing_doc:
                print(f"[KnowledgeSeed] 检测到存量同名文档，安全级联清空Chunks与Document...")
                await session.execute(
                    delete(DocumentChunk).where(DocumentChunk.document_id == existing_doc.id)
                )
                await session.delete(existing_doc)
                await session.commit()

            # 创建文档记录 (默认 visibility='shared' 全网可见， status='processing')
            doc = Document(
                title=kfile["title"],
                file_path=file_path,
                file_type=".md",
                status="processing",
                owner_id=owner_id,
                visibility="shared",
                is_active=1
            )
            session.add(doc)
            await session.flush()  # 获取分配的 doc.id

            try:
                # 解析 Markdown 结构化元素
                elements = await document_service.parse_document_structured(file_path, ".md")
                if not elements:
                    print(f"[KnowledgeSeed] 警告: 无法提取 {kfile['filename']} 的有效元素。")
                    doc.status = "failed"
                    await session.commit()
                    continue

                # 语义分块
                chunks = document_service.chunk_text_structured(elements)
                if not chunks:
                    print(f"[KnowledgeSeed] 警告: 语义切分零分块。")
                    doc.status = "failed"
                    await session.commit()
                    continue

                print(f"[KnowledgeSeed] 成功切分 {len(chunks)} 个 Chunks。正在计算本地 BGE-M3 向量嵌入...")
                
                # 计算本地向量 (use_local_embedding=True 保证离线执行，免费且高稳定性)
                chunk_texts = [c["content"] for c in chunks]
                embeddings = await embedding_service.get_embeddings(
                    texts=chunk_texts,
                    api_key="",
                    provider="local",
                    base_url=None,
                    use_local=True
                )

                if len(embeddings) != len(chunks):
                    raise RuntimeError("生成的 Embedding 数量与 Chunks 数量不一致")

                # 插入 Chunks 向量到数据库
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    session.add(
                        DocumentChunk(
                            document_id=doc.id,
                            content=chunk["content"],
                            chunk_index=i,
                            embedding=embedding,
                            element_type=chunk.get("element_type"),
                            page_number=chunk.get("page_number") or 1,
                            chunk_metadata=chunk.get("chunk_metadata")
                        )
                    )

                doc.status = "completed"
                await session.commit()
                print(f"[KnowledgeSeed] 文档 {kfile['title']} 导入完毕！已存盘 {len(chunks)} 个向量。")
            except Exception as e:
                await session.rollback()
                print(f"[KnowledgeSeed] 导入失败: {e}")
                doc.status = "failed"
                await session.commit()

    print("\n[KnowledgeSeed] 全部预置 Python 核心知识库已成功灌入！")


if __name__ == "__main__":
    asyncio.run(seed_knowledge())
