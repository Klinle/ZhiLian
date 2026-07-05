# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CogniLink — A local-first intelligent knowledge management and learning assistant with RAG, multi-model LLM support, memory extraction, and knowledge graph-based learning.

## Commands

### Frontend (from `frontend/`)
```bash
npm run dev          # Development server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
```

### Backend (from `backend/`)
```bash
python main.py                    # Development server (http://localhost:8000)
uvicorn main:app --reload         # Alternative with hot reload
python seed_data.py               # Seed knowledge graph + agents + labs
```

### Docker
```bash
docker-compose up -d              # Start PostgreSQL 16 + pgvector
docker-compose down               # Stop services
```

## Environment Setup

### System Dependencies for RAG (unstructured)

The `unstructured` library requires these system packages:

```bash
# Ubuntu/Debian
sudo apt install poppler-utils tesseract-ocr libmagic1

# macOS
brew install poppler tesseract libmagic

# Windows
# 1. poppler — download binaries from GitHub releases (oschwartz10612/poppler-windows)
#    Extract to C:\poppler-24.08.0\ and add C:\poppler-24.08.0\Library\bin to PATH
# 2. tesseract — winget install UB-Mannheim.TesseractOCR
#    (Chinese OCR handled by RapidOCR/pymupdf4llm; tesseract is a fallback)
# 3. libmagic — pip install python-magic-bin (provides the Windows DLL)
```

### BGE-M3 Local Embedding (Ollama)

Deploy BGE-M3 to Ollama for offline embedding generation:

```bash
# 1. Download BGE-M3 GGUF from 魔搭社区 (ModelScope)
pip install modelscope
modelscope download --model BAAI/bge-m3-gguf --local_dir ./bge-m3-gguf

# 2. Create Modelfile
cat > Modelfile << 'EOF'
FROM ./bge-m3-gguf/bge-m3-Q5_K_M.gguf
TEMPLATE "{{ .Prompt }}"
EOF

# 3. Create the model in Ollama
ollama create bge-m3 -f Modelfile

# 4. Verify
curl http://localhost:11434/api/embeddings -d '{"model":"bge-m3","prompt":"测试"}'
```

After setup, enable **"本地 Embedding"** toggle in the frontend settings — this routes embedding requests to `http://localhost:11434` instead of cloud API providers.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 + React 19 + TypeScript 5 + TailwindCSS 4 + shadcn/ui + Zustand 5 |
| Backend | FastAPI + SQLAlchemy (async) + LiteLLM + pgvector |
| Database | PostgreSQL 16 + pgvector extension (via `pgvector/pgvector:pg16` Docker image) |
| Charts | ECharts 6 (radar charts, knowledge graph visualization) |

## Architecture

### Backend Service Layer

Services are instantiated as module-level singletons (e.g., `llm_service = LLMService()`). Each API route depends on one or more services:

| Service | Responsibility |
|---------|---------------|
| `llm_service` | Streaming chat via LiteLLM `acompletion`. Builds system prompt from RAG context + memory context. Supports tool calling. |
| `rag_service` | Vector similarity search on `document_chunks` using cosine distance. Annotates chunks with `[来源: 文档名, 第X页]`. |
| `embedding_service` | Embedding generation via direct OpenAI-compatible clients (NOT litellm). Provider routing: OpenAI / Alibaba / Zhipu / Moonshot / Ollama (local BGE-M3). |
| `memory_service` | CRUD for memories + semantic search + auto-extraction from conversations via LLM with importance/whitelist/blacklist filtering. |
| `conversation_service` | Conversation persistence with smart context window management: token counting (tiktoken), auto-summary compression after ~20 messages or 100K tokens, message dedup via `is_summarized` flag. |
| `document_service` | Multi-format parsing with fallback chain for PDF (pymupdf4llm → pypdf → pymupdf → pdfplumber → ocrmac → RapidOCR). Semantic chunking via `unstructured` library. |
| `document_processor` | In-memory background job tracker for document processing progress (pending → processing → completed/failed). |
| `tools_service` | Agent tools: calculator, datetime, DuckDuckGo web search. Registered in OpenAI function-calling format. |

### Database Models (key tables)

- **users** — with role field (student/teacher/admin)
- **agents** — 3 seeded mentors: RAG导师, LangGraph导师, LLMOps助教 (role_type: rag_mentor/langgraph_mentor/llmops_mentor)
- **documents** → **document_chunks** (with pgvector embedding + element_type + page_number)
- **conversations** → **messages** (with token counting, summary compression, soft delete)
- **memories** + **memory_settings** (auto-extract config: whitelist/blacklist/min_importance)
- **knowledge_nodes** → **knowledge_relations** (directed graph with pagerank_weight; categories: RAG, LangGraph, LLMOps)
- **user_knowledge_states** (proficiency, pagerank_score, is_lighted per user per node)
- **labs** → **user_lab_submissions** (coding exercises with test_cases, ai_feedback)

### API Routes

| Prefix | File | Key Endpoints |
|--------|------|--------------|
| `/api` | `chat.py` | `POST /chat` (streaming), `POST /chat/rag` (RAG+memory+tools), `GET /tools` |
| `/api/documents` | `documents.py` | Upload, list, search, content with pagination, reprocess, status polling |
| `/api/conversations` | `conversations.py` | CRUD, search by title/content, message history |
| `/api/memories` | `memories.py` | CRUD, semantic search, extract from text, settings management |

### Chat Data Flow

```
User sends message → POST /api/chat (or /chat/rag)
  → conversation_service.get_optimized_context() (summary + recent messages)
  → llm_service.stream_chat()
    → [optional] rag_service.get_context_for_query() → embedding_service.get_single_embedding() → pgvector cosine_distance
    → [optional] memory_service.get_memory_context() → embedding + cosine_distance
    → LiteLLM acompletion (streaming) with OpenAI-compatible base URL
  → conversation_service.add_message() (both user + assistant)
  → [background] generate_summary() if token/message threshold exceeded
  → [background] _extract_memories_background() if use_memory enabled
```

### Document Processing Flow

```
Upload → save file → create Document record (status: "processing")
  → background asyncio.create_task(_process_document_async)
    → parse_document_structured() → unstructured.partition
    → chunk_text_structured() → unstructured.chunk_by_title (semantic)
    → embedding_service.get_embeddings() → batch embed all chunks
    → insert DocumentChunk rows with embeddings → status: "completed"
```

## Key Implementation Details

### LLM Integration
- Uses **LiteLLM** `acompletion` with `openai/{model}` prefix when custom base_url is provided — this routes through LiteLLM's OpenAI-compatible adapter
- Model and API key are passed **per-request** from the frontend (not from server config); the backend has no persistent user auth session
- Default model is `deepseek-v4-flash` with a hardcoded default API key in both frontend settings store and backend config

### Embedding Providers
- Embedding service **bypasses LiteLLM** — uses direct `openai.AsyncOpenAI` client for most providers
- Zhipu has special handling: uses native `zhipuai` SDK with JWT auth for real API, falls back to `AsyncOpenAI` for proxy setups
- Local embedding via Ollama's `/api/embeddings` endpoint with `bge-m3` model, concurrent requests with semaphore (max 10)

### Conversation Context Management
- Token counting via `tiktoken`; falls back to `len(text)//4` estimation
- When messages exceed 20 or tokens exceed 100K, the service auto-generates a summary of the first half of messages and marks them `is_summarized=1`
- `get_optimized_context()` returns: summary as system message + most recent unsummarized messages (newest first, up to 120K token budget)

### Database
- Async SQLAlchemy with `asyncpg` driver (URL rewritten from `postgresql://` to `postgresql+asyncpg://`)
- `init_db()` enables pgvector extension and creates all tables on startup
- Ad-hoc column additions via `ALTER TABLE ADD COLUMN IF NOT EXISTS` for schema evolution (no Alembic migrations in use)

### Frontend State
- Single Zustand store (`settings-storage`) persisted to localStorage
- Multi-provider API key management (OpenAI, Anthropic, Google, DeepSeek, Alibaba, Zhipu, Moonshot, Cohere, Mistral)
- Feature toggles: `useRAG`, `useMemory`, `useLocalEmbedding` (defaults to true for local BGE-M3)
- Supported models defined in `SUPPORTED_MODELS` array: Gemini 3.1, DeepSeek V4, GLM-4.7/5 series

### Seed Data
- Auto-runs on startup via `lifespan` handler in `main.py`
- Seeds 3 AI mentor agents, 11 knowledge graph nodes (6 RAG + 5 LangGraph) with dependency relations, and 2 coding labs
- Idempotent: skips if `knowledge_nodes` table already has data

### PDF Parsing Fallback Chain
Order of attempt for PDF extraction:
1. `pymupdf4llm` (best — markdown output with structure)
2. `pypdf` (reliable text extraction)
3. `pymupdf` (fitz)
4. `pdfplumber` (good for tables)
5. `ocrmac` (macOS native OCR, zh-Hans + en-US)
6. `RapidOCR` (cross-platform ONNX-based OCR)

First extractor producing ≥60 meaningful alphanumeric chars terminates the chain. If no extractor reaches the threshold, the first non-empty result is returned.

### Frontend Pages
- `/` — Landing page with sidebar navigation
- `/chat` — Main chat interface with conversation history, model selection, RAG/memory toggles
- `/knowledge` — Document upload, list, search, preview
- `/memories` — Memory management and settings
- `/settings` — API key configuration, model selection
- `/graph` — Knowledge graph visualization (ECharts)
- `/practice` — Coding lab exercises
- `/profile` — User profile and learning stats
- `/admin/*` — Admin panel (users, knowledge nodes, questions, intents, keywords, pipeline, sensitive words, settings)
