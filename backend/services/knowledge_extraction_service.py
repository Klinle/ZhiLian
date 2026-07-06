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
)

litellm = import_module("litellm")
acompletion = getattr(litellm, "acompletion")

# 每批处理的 chunk 数量
BATCH_SIZE = 3
# RRF 常量（排名融合参数）
VALID_CATEGORIES = {"RAG", "LangGraph", "LLMOps"}


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
                        category = "RAG"  # 默认分类

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
            "code": "RAG_CHUNK_STRATEGY",
            "name": "分块策略",
            "category": "RAG",
            "description": "文档分块是RAG系统的基础步骤，影响检索质量和生成效果。"
        }}
    ],
    "relations": [
        {{
            "source_code": "RAG_CHUNK_STRATEGY",
            "target_code": "RAG_EMBEDDING",
            "relation_type": "requires"
        }}
    ]
}}
```

## 注意事项
1. 每个节点的 code 必须是大写英文+下划线格式，唯一且具有描述性
2. category 必须是 "RAG"、"LangGraph" 或 "LLMOps" 之一
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


knowledge_extraction_service = KnowledgeExtractionService()
