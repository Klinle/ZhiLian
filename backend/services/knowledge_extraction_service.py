"""知识节点自动提取服务 — LLM 分析文档分块 → 提取关键概念 → 生成 KnowledgeNode + KnowledgeRelation"""

from importlib import import_module
from typing import Optional, Dict, Any, List
import json
import re

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from uuid import UUID

from core.config import settings
from models.database import (
    KnowledgeNode,
    KnowledgeRelation,
    DocumentChunk,
    Document,
)

litellm = import_module("litellm")
acompletion = getattr(litellm, "acompletion")

# 每批处理的 chunk 数量
BATCH_SIZE = 3
# 六大计算机领域分类
VALID_CATEGORIES = {"programming", "dsa", "organization", "os", "network", "database"}


class KnowledgeExtractionService:
    """从文档分块中自动提取知识节点和关系"""

    async def extract_nodes_from_document(
        self,
        document_id: UUID,
        session: AsyncSession,
    ) -> dict:
        """文档分块完成后 → LLM 分析 chunk 内容 → 提取关键概念 → 生成 KnowledgeNode + KnowledgeRelation → 关联 DocumentChunk.node_id

        Args:
            document_id: 文档 UUID
            session: 数据库会话

        Returns:
            {"nodes_created": int, "relations_created": int, "chunks_linked": int}
        """
        # 1. 获取文档的所有分块
        stmt = select(DocumentChunk).where(
            DocumentChunk.document_id == document_id
        ).order_by(DocumentChunk.chunk_index)
        result = await session.execute(stmt)
        chunks = result.scalars().all()

        if not chunks:
            return {"nodes_created": 0, "relations_created": 0, "chunks_linked": 0}

        # 2. 检查 API Key
        api_key = settings.DEEPSEEK_API_KEY
        if not api_key:
            print("[KnowledgeExtraction] No DEEPSEEK_API_KEY configured, skipping extraction")
            return {"nodes_created": 0, "relations_created": 0, "chunks_linked": 0}

        nodes_created = 0
        relations_created = 0
        chunks_linked = 0

        # 3. 分批处理 chunks
        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i: i + BATCH_SIZE]
            batch_texts = [c.content[:2000] for c in batch]  # 截断防止 token 过长

            try:
                extraction = await self._llm_extract_concepts(batch_texts, api_key)
                if not extraction:
                    continue

                batch_nodes = extraction.get("nodes", [])
                batch_relations = extraction.get("relations", [])

                # 4. 创建 / 复用 KnowledgeNode
                node_code_to_id: Dict[str, UUID] = {}
                for node_data in batch_nodes:
                    code = node_data.get("code", "").strip().upper()
                    name = node_data.get("name", "").strip()
                    category = node_data.get("category", "").strip()
                    description = node_data.get("description", "").strip()

                    if not code or not name:
                        continue
                    if category not in VALID_CATEGORIES:
                        category = "programming"  # 默认分类

                    # 查找是否已存在同 code 的节点
                    existing = await session.execute(
                        select(KnowledgeNode).where(KnowledgeNode.code == code)
                    )
                    node = existing.scalars().first()

                    if node is None:
                        node = KnowledgeNode(
                            code=code,
                            name=name,
                            category=category,
                            description=description,
                            pagerank_weight=1.0,
                            source="extraction",
                        )
                        session.add(node)
                        await session.flush()  # 获取 id
                        nodes_created += 1

                    node_code_to_id[code] = node.id

                # 5. 创建 KnowledgeRelation
                for rel_data in batch_relations:
                    src_code = rel_data.get("source_code", "").strip().upper()
                    tgt_code = rel_data.get("target_code", "").strip().upper()
                    rel_type = rel_data.get("relation_type", "requires").strip()

                    if src_code not in node_code_to_id or tgt_code not in node_code_to_id:
                        continue
                    if src_code == tgt_code:
                        continue

                    src_id = node_code_to_id[src_code]
                    tgt_id = node_code_to_id[tgt_code]

                    # 检查是否已存在相同关系
                    existing_rel = await session.execute(
                        select(KnowledgeRelation).where(
                            and_(
                                KnowledgeRelation.source_node_id == src_id,
                                KnowledgeRelation.target_node_id == tgt_id,
                            )
                        )
                    )
                    if existing_rel.scalars().first() is not None:
                        continue

                    rel = KnowledgeRelation(
                        source_node_id=src_id,
                        target_node_id=tgt_id,
                        relation_type=rel_type,
                    )
                    session.add(rel)
                    relations_created += 1

                # 6. 关联 DocumentChunk.node_id（每个 chunk 关联到本批次提取的第一个节点）
                if node_code_to_id and batch_nodes:
                    first_code = batch_nodes[0].get("code", "").strip().upper()
                    first_node_id = node_code_to_id.get(first_code)
                    if first_node_id:
                        for chunk in batch:
                            if chunk.node_id is None:
                                chunk.node_id = first_node_id
                                chunks_linked += 1

                await session.flush()

            except Exception as e:
                print(f"[KnowledgeExtraction] Batch {i//BATCH_SIZE} error: {e}")
                continue

        await session.commit()

        return {
            "nodes_created": nodes_created,
            "relations_created": relations_created,
            "chunks_linked": chunks_linked,
        }

    async def _llm_extract_concepts(
        self,
        batch_texts: List[str],
        api_key: str,
    ) -> Optional[dict]:
        """调用 LLM 从文本中提取知识概念，返回结构化 JSON

        Args:
            batch_texts: 文本内容列表
            api_key: LLM API Key

        Returns:
            {"nodes": [...], "relations": [...]} 或 None
        """
        combined_text = "\n\n---\n\n".join(
            f"[片段{i+1}]\n{text}" for i, text in enumerate(batch_texts)
        )

        prompt = f"""你是一位知识图谱构建专家。请分析以下文档文本内容，提取其中的关键知识点和概念关系。

## 文档文本
{combined_text}

## 输出要求
请以 JSON 格式返回提取的知识节点和关系，不要包含任何其他文本：
```json
{{
    "nodes": [
        {{
            "code": "DSA_BUBBLE_SORT",
            "name": "冒泡排序",
            "category": "dsa",
            "description": "冒泡排序是一种简单的交换排序算法，通过反复比较相邻元素并交换使最大值逐步冒泡到序列末端。"
        }}
    ],
    "relations": [
        {{
            "source_code": "DSA_BUBBLE_SORT",
            "target_code": "DSA_TIME_COMPLEXITY",
            "relation_type": "requires"
        }}
    ]
}}
```

## 注意事项
1. 每个节点的 code 必须是大写英文+下划线格式，唯一且具有描述性
2. category 必须是以下六大计算机领域之一：
   - "programming": 编程开发基础（变量、循环控制流、内置容器、函数参数解包、异常捕获等基础）
   - "dsa": 数据结构与高级特性（列表生成推导式、装饰器切面、迭代器生成器、垃圾回收管理、反射反射元编程等高级）
   - "organization": 面向对象与系统架构（类与实例、面向对象继承多态MRO、魔术方法重载、属性拦截、__slots__优化等结构）
   - "os": 并发编程与操作系统（Pathlib文件IO、GIL锁原理、多线程并发、多进程并行、asyncio协程、并发池等系统并发）
   - "network": 网络编程与联机服务（Socket网络通信、requests请求、FastAPI Web API、网关协议、序列化、虚拟环境等联机）
   - "database": 数据工程与持久化（SQLite嵌入式、SQLAlchemy ORM、pytest单元测试、NumPy/Pandas矩阵与数据清洗分析等）
3. relation_type 只能是 "requires"（前置依赖）或 "extends"（扩展延伸）
4. 只提取真正重要的知识点，每个批次最多提取 5 个节点
5. 如果文本中没有明显的知识点，返回空数组：{{"nodes": [], "relations": []}}
6. 不要编造不存在的概念，只基于文本内容提取"""

        use_model = settings.DEEPSEEK_MODEL
        use_base_url = settings.DEEPSEEK_BASE_URL

        litellm_model = use_model
        if use_base_url and not use_model.startswith("openai/"):
            litellm_model = f"openai/{use_model}"

        kwargs: Dict[str, Any] = {
            "model": litellm_model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是知识图谱构建专家，请严格按照 JSON 格式输出提取结果。",
                },
                {"role": "user", "content": prompt},
            ],
            "api_key": api_key,
            "stream": False,
            "temperature": 0.3,
        }

        if use_base_url:
            kwargs["api_base"] = use_base_url

        try:
            response = await acompletion(**kwargs)
            content = response.choices[0].message.content

            # Parse JSON from response (handle markdown code blocks)
            json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r"\{.*\}", content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = content

            result = json.loads(json_str)
            return result
        except Exception as e:
            print(f"[KnowledgeExtraction] LLM call error: {e}")
            return None

    async def _call_llm_json(
        self,
        system_prompt: str,
        user_prompt: str,
        api_key: str,
        model: str,
        base_url: str,
        temperature: float = 0.3,
    ) -> Optional[dict]:
        """
        通用 LLM 调用，返回解析后的 JSON 字典。

        处理 markdown code block 包裹的 JSON 响应，
        解析失败时返回 None。
        """
        litellm_model = model
        if base_url and not litellm_model.startswith("openai/"):
            litellm_model = f"openai/{litellm_model}"

        kwargs: Dict[str, Any] = {
            "model": litellm_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "api_key": api_key,
            "stream": False,
            "temperature": temperature,
        }

        if base_url:
            kwargs["api_base"] = base_url

        try:
            response = await acompletion(**kwargs)
            content = response.choices[0].message.content

            # Parse JSON from response (handle markdown code blocks)
            json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r"\{.*\}", content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = content

            result = json.loads(json_str)
            return result
        except Exception as e:
            print(f"[KnowledgeExtraction] _call_llm_json error: {e}")
            return None

    async def extract_book_nodes(
        self,
        document_id: UUID,
        session: AsyncSession,
    ) -> dict:
        """从电子书大纲（前几个分块）中，AI 自动提炼生成 12 个专属学习路线节点及其拓扑关系，并入库标记 source='learning_path'。

        此为通用电子书学习 MVP 模式核心逻辑，时间优先，节点限定为 12 个。
        """
        # 0. 查找文档关联的知识库 ID，并判定排重
        doc = await session.get(Document, document_id)
        if not doc or not doc.knowledge_base_id:
            print(f"[BookExtraction] 文档不存在或未关联任何分类知识库: {document_id}")
            return {"nodes_created": 0, "relations_created": 0}
        
        kb_id = doc.knowledge_base_id
        
        # 检查该知识库下是否已经提炼过主线节点
        stmt_exist = select(KnowledgeNode).where(
            and_(
                KnowledgeNode.source == "learning_path",
                KnowledgeNode.knowledge_base_id == kb_id
            )
        ).limit(1)
        exist_res = await session.execute(stmt_exist)
        if exist_res.scalars().first():
            print(f"[BookExtraction] 知识库 {kb_id} 已经存在通关技能树，跳过自动生成图谱。")
            return {"nodes_created": 0, "relations_created": 0}

        # 1. 提取文档前 5 个分块（通常包含目录、大纲或核心概述，约 6000 字符内）
        stmt = select(DocumentChunk).where(
            DocumentChunk.document_id == document_id
        ).order_by(DocumentChunk.chunk_index).limit(5)
        result = await session.execute(stmt)
        outline_chunks = result.scalars().all()

        if not outline_chunks:
            print(f"[BookExtraction] 找不到任何 Chunks 对应 document_id: {document_id}")
            return {"nodes_created": 0, "relations_created": 0}

        outline_text = "\n\n".join(c.content for c in outline_chunks)[:8000]

        # 2. 检查 API Key
        api_key = settings.DEEPSEEK_API_KEY
        if not api_key:
            print("[BookExtraction] No DEEPSEEK_API_KEY configured, skipping book graph extraction")
            return {"nodes_created": 0, "relations_created": 0}

        # 3. 构造出题/构图 Prompt
        system_prompt = "你是一位精通课程大纲与知识图谱设计的教育专家。请严格以 JSON 格式输出，不要包含其他解释文本。"
        user_prompt = f"""请仔细阅读下面这本电子书的大纲和前言文本，为这本书量身定制一套「12个核心节点的自适应通关学习技能树」。

## 书籍大纲文本
{outline_text}

## 生成与架构要求
1. 必须并且只能提炼出【正好 12 个】最具代表性的核心知识点（由浅入深，形成递进学习通路）。
2. 必须把这 12 个节点合理分配到以下 6 个核心 Category 中，每个 Category 【必须刚好分配 2 个节点】：
   - "programming": 第一阶段，基础概念
   - "dsa": 第二阶段，核心原理
   - "organization": 第三阶段，构架设计
   - "os": 第四阶段，高阶实操
   - "network": 第五阶段，网络互联
   - "database": 第六阶段，数据工程
3. 必须生成节点之间的 Requires（前置依赖）拓扑边（关系不能有环，且能构成从第一阶段依次通关解锁到第六阶段的连贯路径）。
4. 节点描述 description 必须是生动的“生活类比/游戏场景/实用价值”描述，控制在 40 字以内。

## 输出 JSON 格式
```json
{{
    "nodes": [
        {{
            "code": "NODE_VAR", // 仅使用大写英文下划线，短小
            "name": "变量命名空间",
            "category": "programming", // 必须是以上 6 个之一
            "description": "游戏里的命名框与属性盒子"
        }}
    ],
    "relations": [
        {{
            "source_code": "NODE_VAR",
            "target_code": "NODE_CONTROL",
            "relation_type": "requires"
        }}
    ]
}}
```"""

        nodes_created = 0
        relations_created = 0

        try:
            # 调用大模型执行图谱提炼
            extraction = await self._call_llm_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                api_key=api_key,
                model=settings.DEEPSEEK_MODEL,
                base_url=settings.DEEPSEEK_BASE_URL,
                temperature=0.3
            )
            
            if not extraction:
                return {"nodes_created": 0, "relations_created": 0}

            extracted_nodes = extraction.get("nodes", [])
            extracted_relations = extraction.get("relations", [])

            suffix = f"{document_id.hex[:6]}"
            node_code_to_id = {}

            # 4. 插入 KnowledgeNode
            for node_data in extracted_nodes:
                orig_code = node_data.get("code", "").strip().upper()
                name = node_data.get("name", "").strip()
                category = node_data.get("category", "").strip()
                description = node_data.get("description", "").strip()

                if not orig_code or not name:
                    continue
                if category not in VALID_CATEGORIES:
                    category = "programming"

                # 拼接唯一 code 防止不同书籍在数据库唯一键冲突
                code = f"{orig_code}_{kb_id.hex[:6]}"

                node = KnowledgeNode(
                    code=code,
                    name=name,
                    category=category,
                    description=description,
                    pagerank_weight=1.0,
                    source="learning_path",
                    document_id=document_id,
                    knowledge_base_id=kb_id
                )
                session.add(node)
                await session.flush()
                node_code_to_id[orig_code] = node.id
                nodes_created += 1

            # 5. 插入 KnowledgeRelation
            for rel_data in extracted_relations:
                src_code = rel_data.get("source_code", "").strip().upper()
                tgt_code = rel_data.get("target_code", "").strip().upper()
                
                if src_code not in node_code_to_id or tgt_code not in node_code_to_id:
                    continue
                if src_code == tgt_code:
                    continue

                src_id = node_code_to_id[src_code]
                tgt_id = node_code_to_id[tgt_code]

                rel = KnowledgeRelation(
                    source_node_id=src_id,
                    target_node_id=tgt_id,
                    relation_type="requires"
                )
                session.add(rel)
                relations_created += 1

            # 6. 把书籍的所有 Chunks 与这 12 个节点绑定（基于包含节点名称的关键字模糊检索）
            # 获取本书全部 Chunks
            all_chunks_stmt = select(DocumentChunk).where(
                DocumentChunk.document_id == document_id
            )
            all_chunks = (await session.execute(all_chunks_stmt)).scalars().all()
            
            # 对每一个新节点，查找包含其关键字的 Chunks 建立关联，供自适应 RAG 检索
            for node_data in extracted_nodes:
                name = node_data.get("name", "").strip()
                orig_code = node_data.get("code", "").strip().upper()
                node_id = node_code_to_id.get(orig_code)
                if not node_id:
                    continue
                
                for chunk in all_chunks:
                    if chunk.node_id is None and (name in chunk.content or orig_code in chunk.content):
                        chunk.node_id = node_id

            await session.commit()
            print(f"[BookExtraction] 书籍图谱提炼完毕！生成 {nodes_created} 个节点，{relations_created} 条依赖边")
            return {"nodes_created": nodes_created, "relations_created": relations_created}

        except Exception as e:
            await session.rollback()
            print(f"[BookExtraction] 书籍提取异常: {e}")
            return {"nodes_created": 0, "relations_created": 0}


knowledge_extraction_service = KnowledgeExtractionService()
