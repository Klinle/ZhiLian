from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from models.database import DocumentChunk, Document
from services.embedding_service import embedding_service
import uuid

class RAGService:
    async def search_similar(
        self,
        query: str,
        api_key: str,
        session: AsyncSession,
        limit: int = 5,
        provider: str = "openai",
        base_url: str = None,
        document_ids: Optional[List[str]] = None,
        use_local: bool = False,
        user_id: str = None,
    ) -> List[DocumentChunk]:
        """Search for similar chunks using vector similarity.

        Args:
            document_ids: Optional list of document UUIDs to filter search scope.
            use_local: If True, use local Ollama BGE-M3 for query embedding.
            user_id: If provided, filter to user's private docs + shared docs.
        """
        # Get query embedding
        query_embedding = await embedding_service.get_single_embedding(
            query, api_key, provider, base_url, use_local
        )

        # Build query with optional document filter
        stmt = select(DocumentChunk)
        if document_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
        # Always join Document to filter out disabled documents
        stmt = stmt.join(Document, DocumentChunk.document_id == Document.id).where(
            Document.is_active == 1
        )
        # Filter by user_id: only return chunks from user's own docs or shared docs
        if user_id:
            stmt = stmt.where(
                or_(
                    Document.owner_id == uuid.UUID(user_id),
                    Document.visibility == "shared",
                )
            )
        stmt = stmt.order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(limit)

        result = await session.execute(stmt)
        return result.scalars().all()

    async def _bm25_search(
        self,
        query: str,
        session: AsyncSession,
        limit: int,
        document_ids: Optional[List[str]] = None,
        user_id: str = None,
    ) -> List[DocumentChunk]:
        """BM25-like sparse retrieval using PostgreSQL full-text search.

        Uses to_tsvector + plainto_tsquery + ts_rank for keyword-based scoring.
        Falls back to empty list if full-text search fails.
        """
        try:
            tsvector = func.to_tsvector('simple', DocumentChunk.content)
            tsquery = func.plainto_tsquery('simple', query)
            rank = func.ts_rank(tsvector, tsquery)

            stmt = select(DocumentChunk).where(tsvector.op('@@')(tsquery))

            if document_ids:
                stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))

            # Always join Document to filter out disabled documents
            stmt = stmt.join(Document, DocumentChunk.document_id == Document.id).where(
                Document.is_active == 1
            )

            if user_id:
                stmt = stmt.where(
                    or_(
                        Document.owner_id == uuid.UUID(user_id),
                        Document.visibility == "shared",
                    )
                )

            stmt = stmt.order_by(rank.desc()).limit(limit)

            result = await session.execute(stmt)
            return result.scalars().all()
        except Exception as e:
            print(f"[BM25 Search] Error: {e}, falling back to vector-only")
            return []

    async def hybrid_search(
        self,
        query: str,
        api_key: str,
        session: AsyncSession,
        limit: int = 5,
        provider: str = "openai",
        base_url: str = None,
        document_ids: Optional[List[str]] = None,
        use_local: bool = False,
        user_id: str = None,
    ) -> List[DocumentChunk]:
        """Hybrid search: BM25 sparse retrieval + vector dense retrieval + RRF fusion.

        Combines keyword-based (BM25) and semantic (vector) search using
        Reciprocal Rank Fusion (RRF) for improved retrieval quality.
        """
        RRF_K = 60  # Standard RRF constant
        retrieval_k = max(limit * 3, 15)  # Over-fetch for better fusion

        # 1. BM25 sparse retrieval
        sparse_chunks = await self._bm25_search(
            query, session, retrieval_k, document_ids, user_id
        )

        # 2. Vector dense retrieval
        dense_chunks = await self.search_similar(
            query, api_key, session, retrieval_k, provider, base_url,
            document_ids, use_local, user_id
        )

        # 3. RRF fusion
        sparse_ranks = {chunk.id: rank + 1 for rank, chunk in enumerate(sparse_chunks)}
        dense_ranks = {chunk.id: rank + 1 for rank, chunk in enumerate(dense_chunks)}

        all_ids = set(sparse_ranks.keys()) | set(dense_ranks.keys())

        rrf_scores = {}
        for chunk_id in all_ids:
            score = 0.0
            if chunk_id in sparse_ranks:
                score += 1.0 / (RRF_K + sparse_ranks[chunk_id])
            if chunk_id in dense_ranks:
                score += 1.0 / (RRF_K + dense_ranks[chunk_id])
            rrf_scores[chunk_id] = score

        # Build chunk lookup map
        chunk_map = {}
        for chunk in sparse_chunks:
            chunk_map[chunk.id] = chunk
        for chunk in dense_chunks:
            if chunk.id not in chunk_map:
                chunk_map[chunk.id] = chunk

        # Sort by RRF score descending
        sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)

        result = []
        for chunk_id in sorted_ids[:limit]:
            chunk = chunk_map.get(chunk_id)
            if chunk:
                result.append(chunk)

        return result

    async def get_context_for_query(
        self,
        query: str,
        api_key: str,
        session: AsyncSession,
        limit: int = 5,
        provider: str = "openai",
        base_url: str = None,
        document_ids: Optional[List[str]] = None,
        use_local: bool = False,
        user_id: str = None,
    ) -> str:
        """Get relevant context for a query, with source annotations.

        Uses hybrid search (BM25 + vector + RRF) for improved retrieval.
        Returns a formatted string with [来源: 文档名, 第X页] annotations
        for each retrieved chunk.
        """
        chunks = await self.hybrid_search(
            query, api_key, session, limit, provider, base_url,
            document_ids, use_local, user_id
        )

        if not chunks:
            return ""

        # Fetch document titles for source annotations
        doc_ids = {chunk.document_id for chunk in chunks}
        doc_titles = {}
        if doc_ids:
            doc_result = await session.execute(
                select(Document.id, Document.title).where(Document.id.in_(doc_ids))
            )
            doc_titles = {row[0]: row[1] for row in doc_result.all()}

        # Build context with source annotations
        parts = []
        for chunk in chunks:
            title = doc_titles.get(chunk.document_id, "未知文档")
            page_info = f", 第{chunk.page_number}页" if chunk.page_number else ""
            source_tag = f"[来源: {title}{page_info}]"
            parts.append(f"{source_tag}\n{chunk.content}")

        return "\n\n".join(parts)

rag_service = RAGService()
