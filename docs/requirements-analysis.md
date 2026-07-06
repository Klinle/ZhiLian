# 知链 / CogniLink — 需求分析文档

> **版本**: v1.2  
> **日期**: 2026-07-05  
> **维护者**: Kleinle (owner) / GitHub: @klinle  
> **状态**: 全部确认

---

## 1. 项目概述

### 1.1 项目身份

| 项 | 值 |
|---|---|
| 项目名 | 知链 / CogniLink |
| 定位 | 大模型应用工程敏捷实训系统 |
| 核心价值 | 一站式、自适应的 LLMOps 智慧学习与代码实操平台 |
| 技术栈 | Next.js 16 + FastAPI + PostgreSQL/pgvector + LiteLLM |

### 1.2 系统目标

为学员提供从**理论学习 → 知识检索 → 代码实操 → 能力评估**的完整闭环：

1. **学** — 通过 AI 导师对话 + RAG 知识库获取理论知识
2. **练** — 通过在线实验（Lab）进行代码实操，自动评测
3. **测** — 通过知识图谱点亮 + 练习测验检验掌握程度
4. **评** — 通过学习画像多维度呈现能力成长曲线

### 1.3 实训领域

系统聚焦三大大模型应用工程方向（已在 seed_data 中定义）：

| 方向 | Agent 导师 | 知识节点数 | 说明 |
|------|-----------|-----------|------|
| RAG | RagBot | 6 | 分块、向量检索、pgvector、混合召回、重排 |
| LangGraph | GraphBot | 5 | 状态机、Node/Edge、条件路由、持久化 |
| LLMOps | OpsBot | 0（待扩展） | 评测、监控、部署 |

---

## 2. 用户角色模型

### 2.1 角色定义

| 角色 | 标识 | 权限范围 |
|------|------|---------|
| 学员 | `student` | 对话、知识库、记忆、练习、查看个人画像/图谱 |
| 教师 | `teacher` | 学员全部权限 + 管理实验题目、查看学员画像（规划中） |
| 管理员 | `admin` | 全部权限 + 系统管理后台 |

### 2.2 角色流转

- 首个注册用户自动成为 `admin`（已在 [auth.py](file://backend/api/auth.py) 实现）
- SuperAdmin 账号 `Kleinle`（大写 K）由 seed_data 注入（密码 `123456`），GitHub 账号为 `klinle`（小写）
- 角色变更仅能由 `admin` 通过后台操作（**当前未实现**）

---

## 3. 功能模块需求

### M1: 用户认证与权限

#### 已实现
- 注册 / 登录 / 获取当前用户信息
- JWT Token 签发与校验（PyJWT + 原生 bcrypt）
- 前端 localStorage 存储 Token + 用户信息
- 前端路由守卫（无 Token 跳转登录页）
- Admin 后台前端角色校验（`role === "admin"`）

#### 缺失 / 待补齐
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M1-1 | 后端 Admin 权限校验中间件（当前仅前端校验，可绕过） | P0 |
| M1-2 | 数据隔离：conversations/documents/memories 按 user_id 过滤 | P0 |
| M1-3 | 角色管理接口（admin 修改用户角色） | P2 |
| M1-4 | 密码修改接口 | P2 |
| M1-5 | Token 刷新机制（当前 Token 无过期） | P3 |

---

### M2: AI 对话引擎

#### 已实现
- 多模型流式对话（LiteLLM 统一调用，支持 DeepSeek/Google/智谱等）
- 对话持久化（Conversation + Message 两张表）
- 智能上下文管理（摘要压缩 + Token 裁剪，120K 上下文窗口）
- 对话搜索（标题 + 内容模糊搜索）
- 前端对话列表、新建、加载、消息渲染、复制、重新生成

#### 缺失 / 待补齐
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M2-1 | 对话按 user_id 隔离（当前全局共享） | P0 |
| M2-2 | Agent 系统提示词注入（Agent 模型已定义但 chat 未使用） | P1 |
| M2-3 | LLM 意图分类自动路由（用户问题 → 分类 RAG/LangGraph/LLMOps → 匹配导师 Agent） | P1 |
| M2-4 | 前端 Agent 选择器（默认「自动路由」，可手动切换指定导师） | P2 |
| M2-5 | `history` 参数实际生效（当前后端忽略前端传入的 history，用 DB 上下文替代） | P2 |
| M2-6 | 对话导出（Markdown/PDF） | P3 |

---

### M3: RAG 知识库

#### 已实现
- 文档上传（PDF/DOCX/TXT/MD）
- 多引擎 PDF 解析（PyMuPDF4LLM → PyPDF → PyMuPDF → PdfPlumber → OCR 降级链）
- 结构化语义分块（unstructured + title 分块策略，含元素类型/页码元信息）
- 向量嵌入（云端 OpenAI/阿里/智谱/Moonshot + 本地 Ollama BGE-M3）
- pgvector 余弦相似度检索 + 来源标注
- 文档管理（列表/预览/分页加载/下载/删除/重处理）
- 处理进度追踪（内存 Job 队列 + 轮询）

#### 文档可见性模型（私有 + 共享）

> **已确认**：知识库支持私有和共享两种模式。

**模型设计**：在 `documents` 表增加 `owner_id`（FK→users.id）和 `visibility`（`private`/`shared`）字段。

| 维度 | 纯私有 | 纯共享 | 混合模式（✅ 采用） |
|------|--------|--------|-------------------|
| 学员个人笔记 | ✅ | ❌ 隐私问题 | ✅ |
| 教师共享教学资料 | ❌ | ✅ | ✅ |
| RAG 检索范围 | 仅个人 | 全局 | 个人 + 共享 |
| 教育场景适配 | 差 | 差 | 优 |

**数据流**：
1. 用户上传文档 → 默认 `private`，`owner_id` = 当前用户
2. 知识库页面 → 显示「我的文档」(owner_id=me) + 「共享文档」(visibility=shared)，标签区分
3. RAG 检索 → `WHERE (owner_id = :uid) OR (visibility = 'shared')`
4. Admin/Teacher 可在管理后台将文档切换为 `shared`（共享教学资料）
5. 删除权限：仅 owner 或 admin

#### 缺失 / 待补齐
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M3-1 | Document 表增加 `owner_id` + `visibility` 字段，实现私有/共享模型 | P0 |
| M3-2 | RAG 检索按 owner_id + visibility 过滤 | P0 |
| M3-3 | 知识库页面区分「我的文档」/「共享文档」标签 | P1 |
| M3-4 | 混合检索（BM25 + 向量 RRF 融合）— seed_data 已有 Lab 题目 | P1 |
| M3-5 | 重排（Cross-Encoder Reranking）— 知识节点已定义 | P1 |
| M3-6 | 文档批量上传 | P3 |
| M3-7 | 文档分类/标签管理 | P3 |

---

### M4: 长期记忆系统

#### 已实现
- LLM 自动从对话提取记忆（DeepSeek 驱动，JSON 结构化输出）
- 手动记忆增删改查
- 语义相似度检索记忆
- 提取策略配置（自动提取开关、白/黑名单主题、最小重要度阈值）
- 记忆上下文注入 LLM System Prompt

#### 缺失 / 待补齐
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M4-1 | 记忆按 user_id 隔离（当前全局共享） | P0 |
| M4-2 | 记忆冲突检测与合并（同类记忆 Upsert） | P1 |
| M4-3 | 记忆过期清理策略 | P2 |
| M4-4 | 记忆编辑（当前仅支持删除，不支持修改内容） | P2 |

---

### M5: Agent 工具系统

#### 已实现（后端）
- 工具注册框架（Tool 类 + ToolsService 单例）
- 3 个内置工具：日期时间、计算器、DuckDuckGo 网页搜索
- LiteLLM function calling 集成
- 工具列表 API（`GET /api/tools`）

#### 缺失 / 待补齐
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M5-1 | 前端工具开关 UI（`use_tools` 字段存在但无 toggle） | P1 |
| M5-2 | 工具调用结果流式回传（当前 function calling 未完整实现） | P1 |
| M5-3 | Agent 选择器（对话时选择不同导师 Agent） | P2 |

---

### M6: 知识图谱与学习追踪

#### 节点来源模型（双来源）

> **已确认**：知识节点采用双来源模式 — seed_data 骨架 + 文档自动提取。

| 来源 | 说明 | 示例 |
|------|------|------|
| seed_data 基础节点 | Admin 手动维护的骨架节点（已有 11 个） | RAG_CHUNKING、LG_STATE |
| 文档自动提取 | 文档处理时 LLM 提取关键概念，自动生成节点 | 用户上传 RAG 论文 → 自动生成「RRF 融合」「BM25」等节点 |

**自动提取流程**：
1. 文档分块完成后 → LLM 分析各 chunk 内容 → 提取关键概念
2. 生成 `KnowledgeNode`（name/category/description）
3. LLM 检测概念间依赖 → 生成 `KnowledgeRelation`（requires/extends）
4. DocumentChunk 关联 KnowledgeNode（新增 `node_id` 外键）
5. Admin 可审核/编辑/删除自动提取的节点

#### 数据基础
后端已定义模型且 seed_data 已注入数据：
- `KnowledgeNode`（11 个节点：RAG 6 + LangGraph 5）
- `KnowledgeRelation`（10 条依赖边）
- `UserKnowledgeState`（用户点亮状态、熟练度、PageRank 分数、学习时长）

#### 已实现（前端）
- `/graph` 页面：ECharts 力导向图可视化、节点点击点亮、进度条
- **但全部为硬编码 Mock 数据**，无 API 调用

#### 需求
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M6-1 | `GET /api/knowledge/graph` — 获取知识图谱全量节点+边+当前用户点亮状态 | P1 |
| M6-2 | `POST /api/knowledge/nodes/{id}/light` — 点亮/取消点亮知识点 | P1 |
| M6-3 | `GET /api/knowledge/nodes/{id}/labs` — 获取某节点关联的实验列表 | P1 |
| M6-4 | 前端 `/graph` 对接真实 API，替换 Mock | P1 |
| M6-5 | 知识节点自动提取 Service（文档处理 → LLM 提取概念 → 生成节点+边） | P2 |
| M6-6 | DocumentChunk 增加 `node_id` 外键，关联知识节点 | P2 |
| M6-7 | PageRank 拓扑拟合分数计算（后端定时任务或触发式） | P2 |
| M6-8 | LLMOps 方向知识节点扩展（当前为 0） | P2 |

---

### M7: 在线实验 / 练习

> **已确认**：选择题 + 代码实操双模式。代码沙箱方案暂定。

#### 数据基础
后端已定义模型且 seed_data 已注入数据：
- `Lab`（2 个实验：RRF 算法实现、LangGraph 条件边实现）
- `UserLabSubmission`（提交记录、代码、评测结果、AI 反馈、分数）
- Lab 含 `starter_code`、`test_cases`（JSON）、`difficulty`

#### 评测方案推荐：LLM 智能评测（替代代码沙箱）

鉴于代码沙箱方案暂未确定，且系统定位为「大模型应用工程实训」，推荐使用 **LLM 智能评测** 替代传统代码执行：

| 方面 | 传统沙箱执行 | LLM 智能评测（✅ 推荐） |
|------|------------|----------------------|
| 安全风险 | 需隔离恶意代码 | 零风险（不执行代码） |
| 基础设施 | 需 Docker/沙箱 | 仅需 LLM API |
| 评测维度 | 仅 pass/fail | 对错 + 代码质量 + 优化建议 |
| 反馈丰富度 | 低 | 高（AI 详细反馈） |
| 与系统定位契合 | 一般 | 高（本身即大模型应用） |
| 实现成本 | 高 | 低 |

**实现流程**：
1. 用户提交代码 → 存入 `UserLabSubmission.submitted_code`
2. LLM 收到：题目描述 + starter_code + test_cases + 用户代码
3. LLM 分析：逻辑正确性、test_cases 覆盖、代码质量
4. 返回：`status` + `evaluation_result`(JSON) + `ai_feedback` + `score`(0-100)

#### 双模式设计

Lab 模型增加 `lab_type` 字段：`code`（代码实操）| `quiz`（选择题）

| 模式 | 评测方式 | 说明 |
|------|---------|------|
| 代码实操 | LLM 智能评测 | 用户编写代码，LLM 分析评分 |
| 选择题 | 程序直接判分 | test_cases 存正确答案，直接比对 |

前端 `/practice` 通过 Tab 切换两种模式。

#### 已实现（前端）
- `/practice` 页面：选择题测验 UI（答题、提交、评分、解析展示）
- **但题目为 3 道硬编码选择题**，需重构为双模式界面

#### 需求
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M7-1 | Lab 模型增加 `lab_type` 字段（code/quiz） | P1 |
| M7-2 | `GET /api/labs` — 获取实验列表（按类型/知识节点/难度筛选） | P1 |
| M7-3 | `GET /api/labs/{id}` — 获取实验详情 | P1 |
| M7-4 | `POST /api/labs/{id}/submit` — 提交答案 + 评测（LLM 评测代码题/程序判分选择题） | P1 |
| M7-5 | `GET /api/labs/{id}/submissions` — 获取用户提交历史 | P1 |
| M7-6 | LLM 评测 Service（封装评测 Prompt + 结构化输出） | P1 |
| M7-7 | 前端 `/practice` 重构为双模式界面（Tab 切换） | P1 |
| M7-8 | 选择题题库 seed_data 扩充 | P2 |
| M7-9 | 代码沙箱方案（如果未来需要真实执行） | P3-暂定 |

---

### M8: 学习画像

#### 数据基础
- `UserKnowledgeState`（熟练度、点亮数、学习时长）
- `UserLabSubmission`（提交数、通过率、分数）

#### 已实现（前端）
- `/profile` 页面：4 张统计卡片 + 雷达图 + 7 天学习时长折线图
- **全部为硬编码 Mock 数据**

#### 需求
| 编号 | 需求 | 优先级 |
|------|------|--------|
| M8-1 | `GET /api/profile/stats` — 聚合统计（点亮数/通过率/学习时长/记忆数） | P1 |
| M8-2 | `GET /api/profile/radar` — 能力维度雷达数据（按 RAG/LangGraph/LLMOps 三方向） | P1 |
| M8-3 | `GET /api/profile/trend` — 近 7 天学习时长趋势 | P2 |
| M8-4 | 前端 `/profile` 对接真实 API | P1 |

---

### M9: 管理后台

> **已确认**：管理后台聚焦于用户管理 + 学生学习情况管理。移除意图/关键词/敏感词/示例问题等无关子页面。

#### 现状
前端 `/admin` 下 8 个子页面全部为静态 Mock，后端完全无对应 API。

#### 功能范围（精简后）

| 子页面 | 保留 | 说明 |
|--------|------|------|
| Dashboard | ✅ | 系统统计概览 |
| 用户管理 | ✅ | 用户列表、角色变更、禁用 |
| 学生学习情况 | ✅（新） | 查看学员画像、学习进度、实验提交 |
| 知识库管理 | ✅ | 文档列表、切换私有/共享 |
| 实验管理 | ✅ | Lab CRUD |
| Agent 管理 | ✅ | 导师 Agent CRUD |
| 意图管理 | ❌ 移除 | 非当前需求 |
| 关键词映射 | ❌ 移除 | 非当前需求 |
| 敏感词库 | ❌ 移除 | 非当前需求 |
| 示例问题 | ❌ 移除 | 非当前需求 |
| 流水线任务 | ❌ 移除 | 复用文档处理进度即可 |
| 系统设置 | ❌ 移除 | 非当前需求 |

#### 需求
| 编号 | 需求 | 优先级 |
|------|------|--------|
| **M9-1** | **Dashboard** — `GET /api/admin/stats`（用户数、文档数、对话数、实验提交数） | P2 |
| **M9-2** | **用户管理** — `GET /api/admin/users`（列表+筛选）、`PUT /api/admin/users/{id}`（角色变更、禁用） | P2 |
| **M9-3** | **学生学习情况** — `GET /api/admin/students`（学员列表+学习概览）、`GET /api/admin/students/{id}/profile`（画像详情、知识图谱状态、实验提交历史） | P2 |
| **M9-4** | **知识库管理** — `GET /api/admin/documents`（全局文档列表）、`PUT /api/admin/documents/{id}`（切换 visibility） | P2 |
| **M9-5** | **实验管理** — `GET/POST/PUT/DELETE /api/admin/labs`（CRUD Lab 题目） | P2 |
| **M9-6** | **Agent 管理** — `GET/POST/PUT /api/admin/agents`（CRUD 导师 Agent） | P2 |
| **M9-7** | 前端 Admin 子页面重构：移除 6 个无关页面，新增「学生学习情况」页 | P2 |
| **M9-8** | 后端 Admin/Teacher 权限校验中间件 | P0 |

---

## 4. 非功能需求

### 4.1 安全

| 编号 | 需求 | 优先级 |
|------|------|--------|
| NFR-S1 | **密钥移入 .env**：DeepSeek API Key 硬编码在 `config.py` 和 `settings.ts` 中，前端直接暴露 | P0 |
| NFR-S2 | 前端移除默认 API Key（`settings.ts` 中的 `sk-c81b...`） | P0 |
| NFR-S3 | 后端 Admin 权限校验（FastAPI Depends 注入 role 检查） | P0 |
| NFR-S4 | 数据隔离（所有查询加 `user_id` 过滤） | P0 |
| NFR-S5 | 代码沙箱安全（Lab 代码执行需隔离环境） | P1 |
| NFR-S6 | Rate Limiting（防刷接口） | P3 |

### 4.2 性能

| 编号 | 需求 | 说明 |
|------|------|------|
| NFR-P1 | 文档处理超时保护 | 已实现（30 分钟 stuck 检测） |
| NFR-P2 | PDF 解析超时 | 已实现（20 秒） |
| NFR-P3 | 向量检索 HNSW 索引 | 需确认 pgvector 索引已创建 |
| NFR-P4 | 对话摘要异步生成 | 已实现（asyncio.create_task） |

### 4.3 可用性

| 编号 | 需求 | 说明 |
|------|------|------|
| NFR-U1 | 前端错误提示友好 | 已实现（try/catch + errorMessage 横幅） |
| NFR-U2 | 文档处理进度可视化 | 已实现（轮询 + 进度条） |
| NFR-U3 | 暗色模式 | 部分实现（CSS class 已有 `dark:` 变体） |

---

## 5. 现状与缺口总览

### 5.1 前后端对齐矩阵

| 模块 | 后端 API | 前端页面 | 对齐状态 |
|------|---------|---------|---------|
| 用户认证 | ✅ `/api/auth/*` | ✅ `/login` | ✅ 对齐 |
| AI 对话 | ✅ `/api/chat` + `/api/conversations/*` | ✅ `/chat` | ✅ 对齐 |
| RAG 知识库 | ✅ `/api/documents/*` | ✅ `/knowledge` | ✅ 对齐 |
| 长期记忆 | ✅ `/api/memories/*` | ✅ `/memories` | ✅ 对齐 |
| 设置 | — | ✅ `/settings` | ✅ 纯本地，设计如此 |
| Agent 工具 | ⚠️ 后端有，无前端 toggle | ❌ 无 UI | ⚠️ 部分 |
| 知识图谱 | ❌ 有模型无 API | ⚠️ `/graph` 纯 Mock | ❌ 未对齐 |
| 在线实验 | ❌ 有模型无 API | ⚠️ `/practice` 纯 Mock | ❌ 未对齐 |
| 学习画像 | ❌ 有模型无 API | ⚠️ `/profile` 纯 Mock | ❌ 未对齐 |
| 管理后台 | ❌ 完全缺失 | ⚠️ `/admin/*` 全 Mock | ❌ 未对齐 |

### 5.2 后端已定义但未使用的模型

| 模型 | 表名 | seed_data | 对应前端 |
|------|------|-----------|---------|
| Agent | agents | ✅ 3 条 | 无 API |
| KnowledgeNode | knowledge_nodes | ✅ 11 条 | `/graph` Mock |
| KnowledgeRelation | knowledge_relations | ✅ 10 条 | `/graph` Mock |
| UserKnowledgeState | user_knowledge_states | — | `/profile` Mock |
| Lab | labs | ✅ 2 条 | `/practice` Mock |
| UserLabSubmission | user_lab_submissions | — | `/practice` Mock |

### 5.3 安全缺口清单

| 缺口 | 位置 | 风险等级 |
|------|------|---------|
| DeepSeek API Key 硬编码 | `backend/core/config.py` L7 | 🔴 高 |
| DeepSeek API Key 前端暴露 | `frontend/stores/settings.ts` L108 | 🔴 高 |
| 无数据隔离 | conversations/documents/memories 查询 | 🔴 高 |
| Admin 鉴权仅前端 | `admin-layout.tsx` L47 | 🟡 中 |
| 计算器 eval 注入 | `tools_service.py` L170 | 🟡 中 |
| Web Search 无 SSRF 防护 | `tools_service.py` L184 | 🟡 中 |

---

## 6. 优先级规划

### P0 — 安全与数据隔离（立即修复）

> 不新增功能，修复现有安全隐患

1. DeepSeek API Key 移入 `.env`，前后端均不硬编码
2. 前端 `settings.ts` 移除默认密钥，改为用户必填
3. 后端所有数据查询加入 `user_id` 过滤（conversations/memories）
4. Document 表增加 `owner_id` + `visibility`，实现私有/共享隔离（M3-1~M3-2）
5. 后端 Admin/Teacher 权限校验中间件（M9-8）

### P1 — 学习闭环核心（主线路径打通）

> 让"学→练→测→评"闭环跑通

1. 知识图谱 API（M6-1~M6-3）+ 前端对接
2. 在线实验 API（M7-1~M7-7）+ 前端双模式重构
3. LLM 智能评测 Service（M7-6）
4. 学习画像 API（M8-1~M8-2）+ 前端对接
5. Agent 系统提示词注入 + LLM 意图分类自动路由（M2-2~M2-3）
6. 前端工具开关 UI（M5-1）
7. 知识库页面区分「我的文档」/「共享文档」（M3-3）

### P2 — 管理后台与增强

> 管理员/教师可操作系统

1. Admin Dashboard 统计 API（M9-1）
2. 用户管理 API（M9-2）
3. 学生学习情况 API（M9-3）
4. 知识库管理 + 文档 visibility 切换（M9-4）
5. 实验/Agent CRUD API（M9-5~M9-6）
6. 前端 Admin 子页面重构（M9-7）
7. 知识节点自动提取 Service（M6-5~M6-6）
8. 混合检索 + 重排（M3-4~M3-5）
9. 记忆冲突检测（M4-2）
10. 前端 Agent 选择器（M2-4）

### P3 — 扩展与打磨

> 锦上添花

1. LLMOps 知识节点扩展（M6-6）
2. 选择题题库扩充（M7-8）
3. 代码沙箱方案（如果未来需要真实执行）（M7-9）
4. 对话导出、批量上传等

---

## 7. 歧义点确认状态

### ✅ Q1: Admin 后台功能范围 — 已确认
> 管理后台暂时只涉及**用户管理**和**学生学习情况管理**（管理员/教师查看学员学习进度、实验提交等）。
> 意图管理、关键词映射、敏感词库、示例问题等子页面**移除**，非当前需求。

### ✅ Q2: `/practice` 页面形态 — 已确认
> **选择题 + 代码实操双模式**均保留。前端通过 Tab 切换。
> 代码实操评测推荐使用 **LLM 智能评测**（不执行代码，LLM 分析评分），代码沙箱方案暂定。

### ✅ Q3: 知识图谱节点来源 — 已确认
> **双来源模式**：seed_data 骨架节点（已有 11 个）+ 文档自动提取。
> 文档处理时 LLM 自动提取关键概念生成 KnowledgeNode，检测依赖生成 KnowledgeRelation。Admin 可审核/编辑/删除。详见 M6 节「节点来源模型」。

### ✅ Q4: Agent 选择机制 — 已确认
> **LLM 意图分类自动路由 + 手动覆盖**。
> 用户发送消息 → LLM 分类意图（RAG/LangGraph/LLMOps/通用）→ 匹配对应导师 Agent → 注入 system_prompt。
> 前端默认「自动路由」，可手动切换指定导师。详见 M2 节 M2-3/M2-4。

### ✅ Q5: 代码沙箱方案 — 已确认（暂定）
> 代码沙箱方案**暂定**。当前推荐 LLM 智能评测替代，如未来需要真实代码执行再引入沙箱。

### ✅ Q6: 知识库可见性 — 已确认
> **私有 + 共享混合模式**。Document 增加 `owner_id` + `visibility` 字段，RAG 检索覆盖个人私有 + 全局共享文档。详见 M3 节「文档可见性模型」。

### ✅ Q7: SuperAdmin 账号 — 已确认
> 管理员账号为 `Kleinle`（大写 K），GitHub 账号为 `klinle`（小写）。seed_data 中的 `Kleinle` 为准。

---

## 8. 技术约束（来自 Tan.md 规范）

| 约束 | 要求 |
|------|------|
| 前端 | Next.js ^16 App Router, TypeScript strict（禁用 any）, Tailwind, Zustand |
| 后端 | FastAPI 全异步, SQLAlchemy Async, PostgreSQL + pgvector |
| 认证 | PyJWT + 原生 bcrypt（禁止 passlib） |
| AI | 通过 `services/llm_service.py` 统一调用 LiteLLM |
| 密钥 | 全部放入 `.env`，禁止硬编码 |
| 前端请求 | 必须经 `getAuthHeaders()` 携带 JWT |
| Git | Conventional Commits, develop 分支开发 |
| 注释 | 中文 |

---

> **状态**: 全部 7 个歧义点已确认。  
> 需求分析完成，可进入 Step 2（方案设计）阶段。
