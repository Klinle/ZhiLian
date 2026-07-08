# 知链 · CogniLink

> **趣味知识学习平台**
> 把枯燥难懂的知识，用通俗类比与趣味互动的方式教会每一位学习者；通过 AI 导师趣味讲解、能力诊断、自适应学习路径推荐与即时反馈，把"学→练→测→评"打通成一条有成就感的学习闭环。

- **唯一维护者**: Kleinle (owner)
- **核心定位**: 一站式、自适应的趣味知识学习与智能辅导平台
- **产品愿景**: 打造一个通用型智能学习引擎 —— 无论放入哪个领域的教程或书籍，系统都能自动解析知识结构、构建知识图谱、生成配套练习，并以 AI 导师趣味讲解的方式教会用户其中的知识。当前以 Python 编程领域为首个落地场景，后续将逐步扩展至任意学科领域。
- **当前知识覆盖**: 编程开发基础、数据结构与高级特性、面向对象与系统架构、并发编程与操作系统、网络编程与联机服务、数据工程与持久化

---

## 目录

- [核心愿景](#核心愿景)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [数据模型](#数据模型)
- [快速启动](#快速启动)
- [环境变量](#环境变量)
- [API 概览](#api-概览)
- [前端页面](#前端页面)
- [核心业务流程](#核心业务流程)
- [分支规范](#分支规范)
- [Git Commit 规范](#git-commit-规范)
- [开发规范](#开发规范)

---

## 核心愿景

让零基础学习者也能轻松入门任意领域的知识：

1. **AI 导师趣味讲解** — 规划了多风格 AI 导师系统，通过类比和故事让概念深入人心（功能设计中，暂未投入使用）
2. **能力诊断与自适应路径** — PageRank 加权知识图谱 + 薄弱点检测，自动推荐最优学习路径
3. **学练测评闭环** — 答题评测 → 点亮节点 → 提升熟练度 → 下次出题聚焦薄弱环节
4. **RAG 检索增强** — 文档上传自动解析、分块、向量化，对话时实时检索知识库上下文
5. **多 Agent 协同** — 基于 LangGraph 的多导师协同对话架构，支持自动路由到最合适的导师（功能设计中，暂未投入使用）

---

## 技术栈

| 层次 | 技术 | 版本约束 |
|---|---|---|
| 前端框架 | Next.js (App Router) | ^16.x |
| 前端语言 | TypeScript (strict mode) | 严格模式，禁用 `any` |
| UI 组件 | Radix UI + Tailwind CSS + shadcn/ui | Tailwind v4 |
| 状态管理 | React hooks + Zustand | 优先 hooks |
| 图表可视化 | ECharts | ^6.x |
| 后端框架 | FastAPI | 全异步 async/await |
| ORM | SQLAlchemy (Async) | 异步 session，分层架构 |
| 数据库 | PostgreSQL + pgvector | docker-compose 启动 |
| 认证 | PyJWT + bcrypt | JWT + cookie 双写 |
| AI | OpenAI / DeepSeek / GLM / LiteLLM | 通过 `services/llm_service.py` 统一调用 |
| 本地嵌入 | FlagEmbedding (BGE-M3) | 无需 API key |
| 多 Agent | LangGraph + langgraph-checkpoint-postgres | 状态持久化 |
| 部署 | Docker Compose | pgvector/pgvector:pg16 |

---

## 项目结构

```
OpenKnowledge/
├── frontend/                      # Next.js 前端
│   ├── app/                       # App Router 页面
│   │   ├── admin/                 # 管理后台
│   │   ├── dashboard/             # 学习主脑（蜂巢技能树 + 学习面板）
│   │   ├── graph/                 # 知识图谱（ECharts 力导向图）
│   │   ├── knowledge/             # 知识库管理
│   │   ├── login/                 # 登录/注册
│   │   ├── memories/              # 记忆系统
│   │   ├── practice/              # 在线练习（5种题型）
│   │   ├── profile/               # 学习画像（雷达图 + 领域进度）
│   │   └── settings/              # 设置（模型选择 + API配置）
│   ├── components/                # 公共组件
│   │   ├── ui/                    # shadcn/ui 基础组件
│   │   ├── admin-layout.tsx       # 管理后台布局
│   │   ├── client-assistant-wrapper.tsx  # 浮动助手包装器
│   │   ├── exercise-renderer.tsx  # 非代码题型渲染器
│   │   ├── floating-chat-assistant.tsx  # 浮动 AI 助手（可拖动）
│   │   ├── knowledge-graph.tsx    # ECharts 知识图谱组件
│   │   ├── pixel-agent-avatar.tsx # 8-bit 像素导师头像
│   │   ├── radar-chart.tsx        # ECharts 雷达图
│   │   ├── skill-node.tsx         # 蜂巢节点
│   │   ├── skill-tree.tsx         # 蜂巢技能树（自研布局算法）
│   │   ├── study-panel.tsx        # 学习面板（推荐+Quiz+雷达）
│   │   ├── workflow-panel.tsx     # 多 Agent 协同流程监控
│   │   └── xp-progress-bar.tsx    # XP 经验进度条
│   ├── hooks/
│   │   └── use-chat.ts            # SSE 流式对话 hook
│   ├── lib/
│   │   ├── api.ts                 # API 客户端（统一携带 JWT）
│   │   ├── sse.ts                 # SSE 流式解析工具
│   │   └── utils.ts               # cn() 等工具函数
│   ├── stores/
│   │   └── chat-assistant.ts      # Zustand 聊天状态
│   ├── types/                     # TypeScript 类型定义
│   ├── middleware.ts              # 认证中间件（cookie 拦截）
│   └── next.config.ts
├── backend/                       # FastAPI 后端
│   ├── api/                       # 路由接口层
│   │   ├── admin.py               # 管理后台（统计/诊断/用户/文档/题库/Agent）
│   │   ├── auth.py                # 认证（登录/注册/me）
│   │   ├── chat.py                # 对话（SSE 流式 / RAG / 多Agent）
│   │   ├── collections.py         # 题目收藏
│   │   ├── conversations.py       # 对话历史管理
│   │   ├── documents.py           # 文档上传与处理流水线
│   │   ├── knowledge.py           # 知识图谱（PageRank/推荐路径）
│   │   ├── labs.py                # 实验系统（列表/提交/AI出题/评测）
│   │   ├── memories.py            # 记忆系统（CRUD/语义搜索/设置）
│   │   └── profile.py             # 学习画像（统计/雷达图）
│   ├── core/                      # 基础设施层
│   │   ├── config.py              # Pydantic Settings 配置
│   │   ├── database.py            # 异步 SQLAlchemy 引擎
│   │   ├── dependencies.py        # FastAPI 依赖注入
│   │   └── security.py            # JWT 签发 + bcrypt 哈希
│   ├── models/
│   │   ├── database.py            # SQLAlchemy ORM 模型（13+表）
│   │   └── schemas.py             # Pydantic 请求/响应模型
│   ├── services/                  # 业务逻辑层
│   │   ├── agent_service.py       # LangGraph 多 Agent 编排
│   │   ├── collection_service.py  # 收藏管理
│   │   ├── conversation_service.py # 对话历史
│   │   ├── document_processor.py  # 文档解析与分块
│   │   ├── document_service.py    # 文档业务逻辑
│   │   ├── embedding_service.py   # 向量嵌入（API + 本地BGE-M3）
│   │   ├── evaluation_service.py  # 代码评测
│   │   ├── graph_service.py       # PageRank + 路径推荐
│   │   ├── knowledge_extraction_service.py # AI 知识图谱提取
│   │   ├── knowledge_service.py   # 知识节点管理
│   │   ├── lab_service.py         # 实验题库 + AI 动态出题
│   │   ├── llm_service.py         # LLM 统一调用层
│   │   ├── memory_service.py      # 记忆提取与检索
│   │   ├── profile_service.py     # 用户画像聚合
│   │   ├── rag_service.py         # RAG 检索增强
│   │   └── tools_service.py       # Agent 工具集
│   ├── knowledge_base/            # 内置知识库文档（Markdown）
│   ├── uploads/                   # 用户上传文档存储
│   ├── tests/                     # pytest 测试
│   ├── seed_data.py               # 种子数据（自动幂等注入）
│   ├── seed_knowledge.py          # 知识库种子
│   ├── main.py                    # FastAPI 入口
│   ├── Dockerfile
│   └── requirements.txt
├── docs/
│   └── implementation_plan.md     # 实现计划文档
├── docker-compose.yml             # PostgreSQL + pgvector + 前后端
├── .env.example                   # 环境变量模板
├── start.bat                      # Windows 一键启动
├── start.ps1                      # PowerShell 启动脚本
├── AGENTS.md                      # AI Agent 开发指南
└── CLAUDE.md                      # Claude Code 配置
```

---

## 核心功能

### 1. AI 导师对话系统

> 该功能处于设计开发阶段，暂未投入实际使用。

系统规划了多风格 AI 导师架构，设计能力包括：

- **人格化导师**：设计了幽默风、学术风、实战风等多种教学风格，通过 LLM 自动路由或手动切换
- **SSE 流式输出**：`/api/chat/rag` 返回 `text/event-stream`，前端逐字渲染
- **四大特性开关**：`use_rag`（知识库检索）/ `use_memory`（长期记忆）/ `use_tools`（Agent 工具）/ `use_local_embedding`（本地嵌入模型）
- **多 Agent 协同**：基于 LangGraph 的多导师协同对话架构，WorkflowPanel 实时展示协同流程

当前对话系统已实现基础 SSE 流式输出和 RAG 检索增强，导师人格化路由和多 Agent 编排功能尚在开发中。

### 2. 蜂巢技能树与自适应学习

- **自研蜂巢布局算法**：6 大分类分行排列，行内按 PageRank 权重排序，奇数行水平偏移形成蜂巢错落
- **SVG 连线**：`requires` 关系用箭头连线，`extends` 用虚线，已点亮通路用分类色，锁定通路灰色
- **前置依赖解锁**：前置知识点全部点亮才解锁后续节点
- **自适应推荐**：Top-3 学习路径推荐，基于薄弱节点和依赖拓扑

### 3. 知识图谱（PageRank + 学习路径）

- **力导向可视化**：ECharts force 布局，节点大小按 PageRank 权重映射（16-40px）
- **点亮机制**：点亮节点用分类色 + 阴影发光，未点亮灰色半透明
- **PageRank 计算**：`/api/knowledge/pagerank` 重算全图权重
- **双来源节点**：`learning_path`（种子数据）+ `extraction`（AI 自动从文档提取）

### 4. 在线练习系统（5 种题型）

| 题型 | 代号 | 说明 |
|---|---|---|
| 代码题 | `code` | VS Code 风格编辑器，LLM 评测，显示分数/问题/建议/历史 |
| 选择题 | `quiz` | 单选，即时判分 |
| 匹配题 | `match` | 左右连线匹配 |
| 排序题 | `arrange` | 拖拽排序代码行 |
| 填空题 | `fill` | 代码填空 |

- **三种出题模式**：`system`（内置题库）/ `dynamic`（AI 针对薄弱节点出题）/ `collection`（收藏夹）
- **AI 出题配置**：题型 + 科目（6 大领域）+ 难度（easy/medium/hard）
- **评测联动图谱**：通过 → 点亮节点 + 提升熟练度；未通过 → 记录薄弱点

### 5. RAG 检索增强

- **文档处理流水线**：上传 → unstructured 解析 → 语义分块 → 向量嵌入 → pgvector 存储
- **双嵌入模式**：API 嵌入（OpenAI）或本地嵌入（BGE-M3，无需 API key）
- **知识库分类**：支持创建多个知识库，对话时按知识库检索
- **知识提取**：AI 自动从文档中提取知识节点和关系，注入图谱

### 6. 记忆系统

- **自动提取**：对话结束后 AI 自动提取重要信息（事实/偏好/目标/重要事项）
- **语义搜索**：基于向量相似度检索相关记忆
- **白名单/黑名单**：精细控制哪些主题需要自动记忆
- **重要度评分**：1-10 分，可调节最小提取阈值

### 7. 学习画像

- **4 张统计卡片**：点亮知识点数 / 实验通过率 / 学习时长 / 记忆条目数
- **ECharts 雷达图**：覆盖率 + 熟练度双维度，6 大领域
- **领域进度条**：六大领域可折叠展开，每个知识节点显示点亮状态/熟练度/学习时长

### 8. 管理后台

- **AI 智能诊断**：SSE 流式调用 LLM，构建运营数据 prompt，输出 JSON 诊断报告（评分/等级/摘要/亮点/风险/建议）
- **6 张统计卡片**：用户/文档/对话/提交/题目/Agent
- **ECharts 可视化**：7 天趋势折线图 / 分类覆盖饼图 / 题型通过率柱状图
- **学员排行榜**：按通关数排序，展示学员学习成果
- **全功能管理**：用户管理 / 文档管理（上传/重新处理/删除/预览）/ 题库管理（CRUD + AI 批量生成）/ Agent 管理（CRUD）

---

## 数据模型

13+ 张核心表，存储于 PostgreSQL + pgvector：

| 模型 | 表名 | 说明 |
|---|---|---|
| User | users | 用户（role: student/teacher/admin） |
| Agent | agents | AI 导师（role_type: humor_mentor/academic_mentor/coach_mentor） |
| KnowledgeBase | knowledge_bases | 知识库分类 |
| Document | documents | 上传文档元数据 |
| DocumentChunk | document_chunks | 文档分块（含 pgvector 向量，关联 node_id） |
| Conversation | conversations | 对话会话 |
| Message | messages | 对话消息 |
| Memory | memories | 长期记忆（含向量，category: fact/preference/goal/important） |
| MemorySetting | memory_settings | 记忆系统设置（自动提取/白名单/黑名单） |
| KnowledgeNode | knowledge_nodes | 知识节点（source: learning_path/extraction） |
| KnowledgeRelation | knowledge_relations | 知识关系（relation_type: requires/extends） |
| UserKnowledgeState | user_knowledge_states | 用户知识掌握状态（proficiency/is_lighted/study_duration） |
| Lab | labs | 实验题目（lab_type: code/quiz/match/arrange/fill） |
| UserLabSubmission | user_lab_submissions | 提交记录 |
| UserCollectionExercise | user_collection_exercises | 收藏的题目 |

---

## 快速启动

### 方式一：本地开发（推荐）

#### 1. 启动数据库

```bash
docker-compose up -d
```

PostgreSQL + pgvector 将在 `localhost:5432` 启动，数据库名 `knowledge_assistant`。

#### 2. 启动后端

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt

# 配置环境变量
copy ..\.env.example .env    # Windows
# cp ../.env.example .env    # Linux/Mac
# 编辑 .env 填入 DEEPSEEK_API_KEY 等配置

uvicorn main:app --reload
```

后端启动时会自动执行 `init_db()` 创建表结构，并注入种子数据（管理员账号 + 40 个 Python 知识节点 + 3 个导师 + 3 个实验题目）。

#### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

#### 4. 访问应用

- 前端：`http://localhost:3000`
- 后端 API：`http://localhost:8000`
- API 文档：`http://localhost:8000/docs`（FastAPI 自动生成）
- 健康检查：`http://localhost:8000/health`

**默认管理员账号：**

| 用户名 | 密码 | 角色 |
|---|---|---|
| `Kleinle` | `123456` | admin |

### 方式二：Docker Compose 一键部署

```bash
# 在项目根目录创建 .env 并填写 DEEPSEEK_API_KEY
docker-compose up --build -d
```

将同时启动 PostgreSQL、后端、前端三个容器。

### 方式三：Windows 一键启动

```bash
# 双击 start.bat 或执行
.\start.bat
```

---

## 环境变量

复制 `.env.example` 到 `backend/.env` 并填写：

```bash
# ── 数据库（与 docker-compose.yml 一致）──
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/knowledge_assistant

# ── JWT 安全密钥（生产环境请替换为随机长字符串）──
SECRET_KEY=change-me-in-production

# ── DeepSeek 默认配置（系统级：记忆提取、摘要生成等）──
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-v4-flash
```

**用户级 LLM 配置**：用户可在前端"设置"页面自行配置各厂商 API Key（OpenAI / DeepSeek / GLM / 通义千问 / 智谱 / 月之暗面 等 9 个厂商），配置存储在前端 localStorage，请求时携带至后端。

`.env` 已在 `.gitignore` 中排除，请勿提交到仓库。

---

## API 概览

所有 API 前缀为 `/api`，需携带 `Authorization: Bearer <JWT>`（登录/注册除外）。

| 模块 | 路由前缀 | 核心接口 |
|---|---|---|
| 认证 | `/api/auth` | `POST /login` · `POST /register` · `GET /me` |
| 对话 | `/api/chat` | `POST /rag`（SSE 流式，含 RAG/记忆/工具/多Agent 开关） |
| 对话管理 | `/api/conversations` | 列表 / 详情 / 删除 / 重命名 |
| 知识图谱 | `/api/knowledge` | `GET /graph` · `POST /pagerank` · `GET /recommend` |
| 实验 | `/api/labs` | 列表 / 详情 / `POST /submit` / `POST /generate`（AI出题） / `POST /evaluate-dynamic` |
| 文档 | `/api/documents` | `POST /upload` · 重新处理 · 删除 · 内容分页 · 预览 |
| 记忆 | `/api/memories` | CRUD · 语义搜索 · 设置管理 |
| 学习画像 | `/api/profile` | `GET /stats` · `GET /radar` |
| 收藏 | `/api/collections` | 列表 / 收藏 / 取消 / 检查 |
| 管理后台 | `/api/admin` | 统计 · AI诊断 · 用户管理 · 学员画像 · 文档管理 · 题库CRUD · Agent管理 |

---

## 前端页面

| 路由 | 页面 | 说明 |
|---|---|---|
| `/login` | 登录页 | 登录/注册双模式，渐变背景，JWT 双写（localStorage + cookie） |
| `/dashboard` | 学习主脑 | 蜂巢技能树 + 悬浮卡片 + 学习面板（推荐路径 + 快速Quiz + 雷达图） |
| `/graph` | 知识图谱 | ECharts 力导向图，节点大小按 PageRank 映射，点击跳转练习 |
| `/practice` | 在线练习 | 三模式切换（内置/AI出题/收藏夹），5 种题型，代码编辑器 + LLM 评测 |
| `/profile` | 学习画像 | 统计卡片 + 雷达图 + 六大领域进度条 |
| `/memories` | 记忆系统 | 记忆列表 + 语义搜索 + 添加记忆 + 设置模态框 |
| `/settings` | 设置 | 模型选择（按厂商筛选）+ API 配置（Key/BaseURL/获取链接） |
| `/admin` | 管理后台 | AI 诊断面板 + 统计图表 + 学员排行榜 + 全功能管理 |

**全局组件：**
- **浮动 AI 助手**：可拖动 8-bit 像素头像，展开为 400x600 浮动窗口，支持全屏扩展，Markdown 渲染，多 Agent 协同流程监控
- **认证中间件**：`middleware.ts` 在服务端拦截所有未认证请求，`/login` 免认证

---

## 核心业务流程

### 自适应学习闭环

```
答题评测 → 通过？ 
  ├─ 是 → 点亮知识节点 + 提升熟练度 → PageRank 重算 → 推荐路径更新
  └─ 否 → 记录薄弱点 → AI 下次出题聚焦薄弱节点 → 重新学习
```

### 文档处理流水线

```
上传文件 → unstructured 解析 → 语义分块 → 向量嵌入（API/本地BGE-M3）→ pgvector 存储
                                                                        ↓
                                              AI 知识提取 → 注入知识图谱节点与关系
```

### RAG 对话流程

```
用户消息 → [use_rag?] 检索知识库向量 → [use_memory?] 检索长期记忆 → 构建 prompt
    → [use_tools?] LangGraph 多 Agent 编排 : 单 Agent 直接调用
    → SSE 流式返回 → 对话结束 → [自动提取记忆]
```

### 多 Agent 协同流程

```
用户消息 → LangGraph 状态机 → 路由决策（auto/humor/academic/coach）
    → 导师生成回答 → 质量检查 → 需要补充？ → 其他导师补充 → 合并输出
    → WorkflowPanel 实时展示协同步骤
```

---

## 分支规范

| 分支 | 用途 |
|---|---|
| `main` | 稳定发布版本，仅接受来自 develop 的合并 |
| `develop` | 日常开发分支，所有新功能在此迭代 |
| `feature/xxx` | 独立功能开发，完成后合并回 develop |
| `hotfix/xxx` | 紧急修复，完成后同步合并到 main 和 develop |

**日常工作流：**

```bash
# 在 develop 上开发
git checkout develop
git add .
git commit -m "feat: xxx"
git push origin develop

# 功能稳定后合并到 main
git checkout main
git merge develop
git push origin main
```

---

## Git Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

| 前缀 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `chore` | 构建/工具/依赖变更 |
| `docs` | 仅文档改动 |
| `refactor` | 重构（不新增功能不修复 bug） |
| `style` | 格式调整（不影响逻辑） |
| `test` | 测试相关 |
| `perf` | 性能优化 |

示例：`feat: 添加知识图谱 PageRank 权重计算接口`

---

## 开发规范

### 后端

- 分层架构：`api/`（路由）→ `services/`（业务逻辑）→ `models/`（ORM + Pydantic）→ `core/`（基础设施）
- 全异步：FastAPI 端点 + SQLAlchemy AsyncSession
- 错误处理：API 层抛 `HTTPException`，写操作异常时回滚 session
- 命名：类名 PascalCase，函数/变量 snake_case

### 前端

- TypeScript 严格模式，禁用 `any`
- 客户端组件标记 `"use client"`，优先 hooks + 局部状态
- API 请求统一通过 `getAuthHeaders()` 携带 JWT
- `@/` 路径别名导入内部模块
- 复用 `cn()` 辅助函数组合样式类

### 通用

- 注释全部使用中文
- 禁止空 except / 禁止裸 fetch / 禁止明文密钥
- 童子军法则：离开时的代码比来时更干净

---

## UI 视觉重构 (v2.0)

本项目已全面重构为 **Neo-brutalism 新粗犷卡通纸张风格**，去除了冷冰冰的 AI 发光高科技感，赋予平台温馨、活泼、充满趣味的学习氛围：
1. **统一羊皮纸格子背景** — 核心页面（Dashboard、Graph、Practice、Profile、Login）统一应用温暖的米黄底色与微弱的方格图纸纹路。
2. **Neo-brutalism 粗黑投影卡片** — 容器卡片、导航 Badge、输入框与交互按钮，均配有 2px 粗黑边框与实体黑色偏移投影。
3. **两只大眼睛的大脑 SVG Logo** — 为项目 **CogniLink** 设计了极具辨识度的呆萌大脑连接 Logo。以粉红色云朵状大脑为载体，正中配有两只巨大的黑白呆萌大眼睛，向内对视，生动诠释了对知识的无限渴求，四周环绕着知识连线的卡通节点。
4. **统一高对比度糖果色系** — 知识网络与蜂巢技能树的分类点亮配色统一采用柠檬绿、玫瑰红、蔚蓝、活力橙、浆果紫和薄荷绿的高对比度卡通色。

---

*Private repository — All rights reserved by Kleinle.*
