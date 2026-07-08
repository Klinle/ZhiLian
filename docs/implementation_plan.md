# 后台管理系统优化方案（修订版）

## 变更范围

| 页面 | 工作内容 |
|------|----------|
| `admin/page.tsx` (Dashboard) | AI 诊断改为纯前端，使用当前页面已展示的数据组装 prompt |
| `admin/students/page.tsx` | 注入静态 Mock 数据（与 Dashboard 排行榜一致），美化 UI |
| `admin/users/page.tsx` | 注入静态 Mock 数据（与 Dashboard 一致），美化 UI |
| `admin/knowledge/page.tsx` | 美化 UI 样式 |
| `admin/labs/page.tsx` | 美化 UI 样式 |
| `admin/agents/page.tsx` | 美化 UI 样式 |

---

## 一、Dashboard — AI 诊断纯前端化

### 当前问题
`handleStartAiEvaluation()` 调用 `adminApi.getAiEvaluation()` → `POST /api/admin/stats/ai-evaluation`，依赖后端。

### 改造方案
改为前端直接组装 prompt，调用 `chatApi.sendMessage({ useRag: false, message: prompt })`，SSE 流式接收。

### Prompt 数据来源（全部来自当前页面已展示的数据）
- 6 个统计卡片（users, documents, conversations, submissions, labs, agents）
- 排行榜 13 人数据（leaderboard state）
- 知识分类分布（category_distribution）
- 题型通过率（lab_type_distribution）

### Prompt 模板
```
你是 CogniLink 在线教育平台运营分析师。以下是当前页面的运营数据快照:

【平台概览】
- 注册用户: {users} 人 | 文档: {documents} | 对话: {conversations}
- 题目总量: {labs} 道 | 实验提交: {submissions} | AI导师: {agents}

【学员排行榜】(按通关习题降序)
{leaderboard 表格: 排名/姓名/角色/掌握度/通关/对话/活跃}

【知识分类分布】
{category_distribution: 分类名/节点数/文档数/题目数}

【题型通过率】
{lab_type_distribution: 题型/总题数/提交数/通过数}

请输出 JSON:
{
  "score": <0-100>,
  "grade": "<优秀|良好|待改善|预警>",
  "summary": "<2-3句结论>",
  "highlights": ["..."],
  "risks": ["..."],
  "suggestions": [{"priority":"高/中/低","title":"...","detail":"..."}]
}
```

### API Key
从 `useSettingsStore` 读取用户配置的 API Key/Model/BaseUrl。

### UI 改动
- 删除 `adminApi.getAiEvaluation()` 调用
- 流式输出时展示打字机效果
- 解析 JSON 后渲染为结构化卡片（评分圆 + 发现/风险 + 建议列表）

---

## 二、学员概览 — Mock 数据注入 + UI 美化

### Mock 数据
复用 Dashboard 的 `VIRTUAL_LEADERBOARD` + `MOCK_NAMES`，确保 13 名学员与 Dashboard 排行榜完全一致。

每名学员卡片展示：
- 头像（首字）、姓名、角色 Badge
- 知识掌握进度条（nodesMastered/totalNodes）
- 通关习题数、活跃对话数
- 上次活跃时间

### UI 美化
- 卡片增加 hover 阴影和渐变边框
- 角色 Badge 配色与 Dashboard 一致
- 进度条使用渐变色
- 添加顶部统计摘要（总学员数、平均掌握率、平均通过题数）
- Dark mode 适配

---

## 三、用户管理 — Mock 数据注入 + UI 美化

### Mock 数据
与 Dashboard 一致的 13 人用户列表（Kleinle 管理员 + student_full/half + 10 名普通学员）。

表格增强字段：
- 注册时长（从 joinDate 计算）
- 活跃状态点（绿色=近期活跃，灰色=超过3天）
- 角色 Badge 色彩（admin=rose, teacher=amber, student=slate）

### UI 美化
- 表格行 hover 高亮
- 头像改为渐变背景 + 首字
- 角色编辑改用内联下拉框
- Dark mode 适配

---

## 四、其余页面 — 纯 UI 美化

### knowledge / labs / agents
- 统一卡片圆角、边框色、阴影
- 按钮 hover 状态统一
- 空状态插图优化
- Dark mode 适配检查

---

## 五、文件变更

| 操作 | 文件 |
|------|------|
| 修改 | `frontend/app/admin/page.tsx` — AI 诊断纯前端化 |
| 修改 | `frontend/app/admin/students/page.tsx` — Mock 数据 + 美化 |
| 修改 | `frontend/app/admin/users/page.tsx` — Mock 数据 + 美化 |
| 修改 | `frontend/app/admin/knowledge/page.tsx` — UI 美化 |
| 修改 | `frontend/app/admin/labs/page.tsx` — UI 美化 |
| 修改 | `frontend/app/admin/agents/page.tsx` — UI 美化 |
| 修改 | `docs/implementation_plan.md` — 本方案文档 |

不新建任何文件。Mock 数据内联在各页面中（避免创建 `mock-data.ts` 间接层）。
