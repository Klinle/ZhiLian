from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from models.database import Base
from core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=False,
)

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def init_db():
    async with engine.begin() as conn:
        # Enable pgvector extension before creating tables that use Vector columns
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

        # Add new columns to document_chunks if they don't exist (for existing DBs without migrations)
        alter_statements = [
            "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS element_type VARCHAR(50)",
            "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page_number INTEGER",
            "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunk_metadata JSON",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_id UUID",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'private'",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1",
            "ALTER TABLE labs ADD COLUMN IF NOT EXISTS lab_type VARCHAR(20) DEFAULT 'code'",
            "ALTER TABLE labs ADD COLUMN IF NOT EXISTS detailed_explanation TEXT",
            "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS node_id UUID",
            "ALTER TABLE memories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE",
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE",
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL",
            "ALTER TABLE knowledge_nodes ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'extraction'",
        ]
        for stmt in alter_statements:
            await conn.execute(text(stmt))

async def get_session():
    async with async_session_maker() as session:
        yield session
