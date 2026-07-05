from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.database import DocumentChunk, Document
from services.embedding_service import embedding_service

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
    ) -> List[DocumentChunk]:
        """Search for similar chunks using vector similarity.

        Args:
            document_ids: Optional list of document UUIDs to filter search scope.
            use_local: If True, use local Ollama BGE-M3 for query embedding.
        """
        # Get query embedding
        query_embedding = await embedding_service.get_single_embedding(
            query, api_key, provider, base_url, use_local
        )

        # Build query with optional document filter
        stmt = select(DocumentChunk)
        if document_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(document_ids))
        stmt = stmt.order_by(
            DocumentChunk.embedding.cosine_distance(query_embedding)
        ).limit(limit)

        result = await session.execute(stmt)
        return result.scalars().all()

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
    ) -> str:
        """Get relevant context for a query, with source annotations.

        Returns a formatted string with [来源: 文档名, 第X页] annotations
        for each retrieved chunk.
        """
        chunks = await self.search_similar(
            query, api_key, session, limit, provider, base_url,
            document_ids, use_local
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
