# CogniLink 开发会话变更记录

> **用途**：本文件为 Agent 记忆文件，供接手开发的 Agent 快速了解本次会话的完整改动。
> **会话日期**：2026-07-07
> **涵盖分支**：`develop`
> **Git 提交范围**：`9be4b76` → `af13be5`（共 9 次提交）

---

## 一、本次会话任务概览

本次会话共完成了两个大方向的开发工作：

1. **阶段八：全设备响应式布局适配**（T36–T39）
2. **Bug 修复与体验优化**（响应式溢出、交互 Bug、功能增强）

---

## 二、Git 提交明细（时序）

| 哈希 | 类型 | 说明 |
|---|---|---|
| `9be4b76` | feat | UserLayout 移动端浮动抽屉侧边栏 + Mobile Header |
| `278c3d1` | feat | AdminLayout 移动端汉堡包适配 |
| `d3a499f` | feat | 在线练习中心 Workspace 响应式排版（flex-col md:flex-row）|
| `5c8660f` | fix | 蜂巢技能树小屏溢出修复（分类标签内嵌画布）|
| `31a1302` | fix | Dashboard 右侧栏溢出修复（双列独立滚动架构）|
| `291e793` | fix | Admin 侧栏高度修复 + 悬浮 AI 助手"扩大到屏幕中央"功能 |
| `dabe225` | fix | 导师选择菜单从 CSS hover 改为 click 受控下拉 |
| `af13be5` | feat | 知识库 RAG 默认开启 |

---

## 三、详细变更说明

### 3.1 UserLayout 响应式重构（`9be4b76`）

**文件**：`frontend/components/user-layout.tsx`

**改动要点**：
- 新增 `isMobile` 状态，监听 `window.resize`，在 `< 768px` 时切换为移动端模式
- 移动端下侧边栏改为 `fixed` 浮动抽屉，宽 `w-64`，带 `shadow-2xl`
- 添加 `bg-black/45 backdrop-blur-sm` 毛玻璃遮罩，点击遮罩关闭抽屉
- 移动端顶部新增 `h-16` Mobile Header，包含汉堡菜单按钮、Logo、AI 导师召唤按钮
- 使用 `mounted` 状态守卫（SSR Hydration 防崩）

### 3.2 AdminLayout 响应式重构（`278c3d1`、`291e793`）

**文件**：`frontend/components/admin-layout.tsx`

**改动要点**：
- 外层容器从 `min-h-screen` → `h-screen overflow-hidden`（锁定高度，避免侧栏塌陷）
- 侧边栏从 `h-full` → `h-screen`（直接撑满视口高度）
- 新增三段式断点逻辑：
  - `> 1024px`（lg）：展开完整文字菜单
  - `768px ~ 1024px`（md~lg）：自动折叠为 `w-16` 图标模式，悬停显示 tooltip
  - `< 768px`（移动端）：隐藏，Header 汉堡包唤出浮动抽屉
- Header 最左侧添加移动端专用 `Menu` 按钮

### 3.3 在线练习中心响应式（`d3a499f`）

**文件**：`frontend/app/practice/page.tsx`

**改动要点**：
- Header 区间距：`p-8` → `p-4 md:p-8`（移动端减少留白）
- Workspace 容器：`flex flex-row` → `flex flex-col md:flex-row`（手机端竖排）
- Workspace 内边距：`p-8` → `p-4 md:p-8`
- 左侧配置面板宽度：`w-72` → `w-full md:w-72`（手机端全宽）

### 3.4 蜂巢技能树溢出修复（`5c8660f`）

**文件**：`frontend/components/skill-tree.tsx`

**问题根因**：
- 分类标签列（`absolute left-4`）悬浮在 `overflow-auto` 父容器上，横向滚动时标签不随内容移动，导致最左侧节点被永久遮挡
- 节点坐标 `left = cIndex * 140 + 20` 起始值过小，与 96px 宽的标签列重叠

**修复方案**：
- 移除外层 `absolute` 标签层，改为将分类标签列**内嵌到可滚动画布**内部（`position:absolute, left:4`），标签与节点同属一个坐标系，横向滚动时整体联动
- 节点坐标起始 `left` 加上 `labelColWidth(96) + 12 = 108px` 偏移，与标签列彻底分离
- 画布总宽度计算加上 `LABEL_COL_WIDTH`，保证滚动区域完整覆盖所有节点

### 3.5 Dashboard 右侧栏溢出修复（`31a1302`）

**文件**：`frontend/app/dashboard/page.tsx`、`frontend/components/study-panel.tsx`

**问题根因**：
原布局为"单一整体滚动容器"，右侧 `StudyPanel`（`w-80`）被包含在 `overflow-y-auto` 容器内，当页面放大超过 75% 时内容总宽超出可视区，`overflow-y-auto` 不允许横向滚动导致右侧栏被推出屏幕外。

**修复方案（双列独立滚动架构）**：

```
overflow-hidden（外层不滚动）
  ├── shrink-0  顶部固定区（Header 标题 + XP进度条 + 分割线）
  └── flex-1 flex-row overflow-hidden（主体双栏）
        ├── flex-1 overflow-auto   左侧技能树（自己横/纵滚动）
        └── lg:w-80 overflow-y-auto  右侧面板（固定宽，自己纵滚动）
```

- `StudyPanel` 根 div 宽度控制移交给外层（去掉 `w-80 shrink-0`，改为 `flex flex-col min-w-0`）
- 右侧容器：`lg:w-80 shrink-0 overflow-y-auto p-4`，带左边框分割线
- 小屏（`< lg`）下右侧栏退化为下方纵向排列，带顶边框分割线

### 3.6 悬浮 AI 助手"扩大到屏幕中央"功能（`291e793`）

**文件**：`frontend/components/floating-chat-assistant.tsx`

**改动要点**：
- 新增 `isExpanded` 状态（默认 `false`）
- 头部工具栏增加 `Maximize2` / `Minimize2` 切换按钮（位于关闭按钮左侧）
- `isExpanded=true` 时：
  - 背后渲染 `fixed inset-0 bg-black/40 backdrop-blur-sm z-40` 遮罩（点击遮罩还原）
  - 窗口从右下角 `w-[400px] h-[600px]` → 屏幕正中央 `w-[min(700px,95vw)] h-[85vh]`
  - 使用 `zoom-in-95 fade-in` 动画入场
- 根节点由单 `<div>` 改为 `<>...</>` Fragment，支持遮罩层平级渲染

### 3.7 导师选择菜单 Bug 修复（`dabe225`）

**文件**：`frontend/components/floating-chat-assistant.tsx`

**问题根因**：
导师选择使用纯 CSS `group`/`group-hover:block` 方案，移动端无 hover 事件，菜单永远不显示；选中后不自动关闭。

**修复方案**：
- 新增 `showAgentMenu` 状态和 `agentMenuRef` 引用
- 按钮 `onClick` 切换 `showAgentMenu`
- 每个选项 `onClick` 在选择后调用 `setShowAgentMenu(false)` 自动关闭
- `useEffect` 监听 `document mousedown`，通过 `agentMenuRef.contains()` 判断点击是否在菜单外，实现点击外部关闭
- `ChevronDown` 加 `rotate-180` 动画指示菜单展开/收起状态
- 下拉列表入场动画：`animate-in fade-in slide-in-from-top-1`

### 3.8 知识库 RAG 默认开启（`af13be5`）

**文件**：`frontend/stores/settings.ts`

**改动要点**：
```diff
- useRAG: false,
+ useRAG: true,   // 知识库 RAG 默认开启，后续将导入六大领域知识点
```

---

## 四、RAG 知识库现状说明

### 当前状态

| 项 | 现状 |
|---|---|
| RAG 检索引擎 | ✅ 已完整实现：BM25 稀疏检索 + 向量稠密检索 + RRF 融合排序 |
| 知识库内容 | ❌ 空库（零文档，待导入） |
| 文档权限模型 | `private`（仅上传者可见）/ `shared`（全员共享） |
| Embedding 服务 | 支持 OpenAI / 本地 Ollama BGE-M3 双模式 |

### 后续完善计划

为六大领域导入公共知识文档（`visibility=shared`）：

| 领域 | 推荐文档来源 |
|---|---|
| 编程基础 | Python/C++ 文档精华、《Think Python》 |
| 数据结构与算法 | 《算法导论》关键章节、LeetCode 分类题解 |
| 计算机组成原理 | 《计算机组成原理（唐朔飞版）》PDF |
| 操作系统 | 《现代操作系统》、MIT 6.828 Notes |
| 计算机网络 | 《计算机网络（谢希仁版）》、RFC 精要总结 |
| 数据库 | 《数据库系统概念（第7版）》、PostgreSQL 文档 |

**操作方式**：管理后台 `/admin/knowledge` → 上传文档 → 可见性选 `shared` → 系统自动完成分块+向量化

---

## 五、当前架构关键文件速查

### 前端组件

| 文件 | 职责 |
|---|---|
| `components/user-layout.tsx` | 用户端整体布局（侧边栏 + Mobile Header）|
| `components/admin-layout.tsx` | 管理员端整体布局（侧边栏 + 顶栏 + 移动端抽屉）|
| `components/skill-tree.tsx` | 蜂巢六边形技能树（绝对坐标节点布局 + SVG 连线）|
| `components/study-panel.tsx` | Dashboard 右侧学习面板（推荐路径 + Quiz + 雷达图）|
| `components/floating-chat-assistant.tsx` | 全局悬浮 AI 导师窗口（支持扩展到屏幕中央）|
| `app/dashboard/page.tsx` | 主脑图谱首页（双列独立滚动布局）|
| `app/practice/page.tsx` | 在线练习中心（题库 + AI 出题 + 收藏夹，响应式）|
| `stores/settings.ts` | 全局设置 Zustand Store（RAG/Memory/Tools 开关）|

### 后端服务

| 文件 | 职责 |
|---|---|
| `services/rag_service.py` | RAG 混合检索（BM25 + 向量 + RRF 融合）|
| `services/embedding_service.py` | 文本向量化（OpenAI / 本地 Ollama）|
| `services/document_service.py` | 文档解析分块入库（PDF/Word/TXT/OCR）|
| `services/llm_service.py` | LLM 统一调用封装（流式 + 非流式）|
| `services/graph_service.py` | LangGraph 多 Agent 编排状态机 |
| `services/knowledge_service.py` | 知识图谱 + PageRank 学习曲线计算 |

---

## 六、已知问题 & 后续优化建议

| 优先级 | 问题 / 建议 |
|---|---|
| 🔴 高 | RAG 知识库内容为空，需尽快导入六大领域文档 |
| 🟡 中 | 蜂巢技能树节点在极小屏幕下仍需横向滚动（由于绝对坐标布局的本质限制）|
| 🟡 中 | 移动端 Practice 左侧配置面板展开时与右侧答题区纵向叠加，高度可能过长，可考虑折叠/展开切换设计 |
| 🟢 低 | Dashboard XP 进度条现在固定在顶部，若屏幕高度过小（< 600px）可能挤压双栏区域，可考虑添加 `min-h-0` 保护 |
| 🟢 低 | 悬浮 AI 助手扩展至屏幕中央模式下，关闭（X）操作同时会将状态恢复为非扩展，体验符合预期，但关闭动画可进一步完善 |

---

> 本文件记录时间：2026-07-07
> 下一个接手 Agent 可直接从此文件了解本次所有改动背景，无需翻阅 Git 历史。
