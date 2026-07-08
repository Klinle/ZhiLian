# 后台管理系统 — 虚拟数据对齐 & AI 诊断弹窗重构方案

## 背景与目标

当前只有 `admin/page.tsx`（Dashboard）拥有完整的虚拟学员数据和静态 Mock 数据。其他 5 个管理页面（students / users / knowledge / labs / agents）与 Dashboard 的数据存在明显割裂，演示时会露馅。

同时，现有 AI 诊断功能依赖后端 `/api/admin/stats/ai-evaluation` 接口，需要重构为纯前端——通过组装当前页面数据为 prompt，直接调用 LLM API（与学员端聊天使用相同的调用路径），并在弹窗中展示结果。

---

## 一、共享 Mock 数据层设计

> [!IMPORTANT]
> 新建一个文件 `frontend/lib/mock-data.ts`，作为全局唯一的虚拟数据源。所有 admin 页面 import 此文件，彻底消除数据孤岛。

### 1.1 文件结构

```
frontend/lib/mock-data.ts
```

包含以下导出：

| 导出名 | 用途 |
|---|---|
| `MOCK_STUDENTS` | 13 名虚拟学员完整信息（含 student_half / student_full 演示账户） |
| `MOCK_USERS` | 系统注册用户列表（含管理员），用于 users 页 |
| `MOCK_KNOWLEDGE_ACTIVITY` | 每个知识节点的访问次数和学员掌握人数 |
| `MOCK_LAB_SUBMISSIONS` | 题目提交记录（按题型分布） |
| `MOCK_AGENT_SESSIONS` | Agent 对话会话摘要（活跃时间、轮次、满意度） |
| `STATIC_TREND_DATA` | 7 天趋势数据（从 admin/page.tsx 迁移过来） |

### 1.2 学员数据规格

```ts
interface MockStudent {
  id: string;
  username: string;
  nickname: string;
  avatar: string;        // 2字取首
  role: "学员" | "管理员";
  nodesMastered: number; // 0~41
  totalNodes: 41;
  exercisesPassed: number;
  chatCount: number;
  lastActive: string;    // "xx分钟前" | "昨天" | "x天前"
  joinDate: string;      // "2025-0x-xx"
  weakCategories: string[]; // 薄弱知识类别
}
```

**数据分布规则（演示安全）：**
- `student_full` → 41/41 节点，87 题通关，186 次对话，12 分钟前活跃
- `student_half` → 20/41 节点，45 题通关，98 次对话，15 分钟前活跃
- 管理员（Kleinle）→ 0/41，0 题，123 次对话，18 分钟前
- 其余 10 名普通学员 → nodesMastered 在 1~11 之间（< 30%），使用正常姓名

---

## 二、各管理页面 Mock 数据注入方案

### 2.1 `admin/students` — 学员管理页

**现状：** 调用 `adminApi.listStudents()`，只显示真实注册用户，数量少且信息单薄。

**改造：**
- API 数据与 `MOCK_STUDENTS` 合并（同 dashboard 逻辑），API 用户若有对应 username 则覆盖 Mock，否则追加
- 新增雷达图/进度卡展示每位学员的 6 维能力（复用知识分类维度）
- 新增 **AI 诊断按钮**：分析整体学员群体学习状态

### 2.2 `admin/users` — 用户管理页

**现状：** 调用 `adminApi.listUsers()`，表格展示用户基本信息。

**改造：**
- 数据源同样与 `MOCK_USERS` 合并，确保始终展示 13 人
- 补充「注册时长」「角色标签」「活跃状态点」等字段
- 新增 **AI 诊断按钮**：分析用户增长趋势和留存风险

### 2.3 `admin/knowledge` — 知识库管理页

**现状：** 列出文档/知识节点，后端数据。

**改造：**
- 注入 `MOCK_KNOWLEDGE_ACTIVITY`：为每个节点补充「学员覆盖率」「平均掌握分」「热度排名」
- 添加小型热力分布图（ECharts heatmap）
- 新增 **AI 诊断按钮**：分析知识体系覆盖死角

### 2.4 `admin/labs` — 题目管理页

**现状：** 列出实验/题目。

**改造：**
- 注入 `MOCK_LAB_SUBMISSIONS`：每道题展示提交次数、通过率、平均耗时
- 补充题型分布 Badge、难度色彩标签
- 新增 **AI 诊断按钮**：分析题目难度分布与通过率瓶颈

### 2.5 `admin/agents` — AI 导师管理页

**现状：** 列出 Agent 配置。

**改造：**
- 注入 `MOCK_AGENT_SESSIONS`：每个 Agent 展示总会话数、本周活跃数、满意度评分
- 补充活跃时间热图（7 天 × 24 小时的 mock 热力数据）
- 新增 **AI 诊断按钮**：分析各 Agent 的调用质量与使用分布

---

## 三、AI 诊断弹窗 — 纯前端实现方案

> [!IMPORTANT]
> **完全脱离后端**。删除 `adminApi.getAiEvaluation()` 调用，改为前端直接组装 prompt 发送至 LLM（通过 `/api/chat/rag` 流式接口，`use_rag=false`）。

### 3.1 调用链路

```
用户点击"开启AI诊断"
    ↓
前端收集当前页面的全部 Mock 数据快照
    ↓
组装结构化中文 prompt（含角色定义 + 数据上下文 + 分析要求）
    ↓
调用 chatApi.sendMessage({ useRag: false, message: prompt })
    ↓
SSE 流式接收，逐字渲染到弹窗
    ↓
解析输出中的 JSON 结构（评分、建议列表、结论段落）
```

### 3.2 Prompt 模板结构

```
你是一个专业的在线教育平台运营分析师。以下是平台当前的运营数据快照，
请基于这些数据进行深度分析，并输出结构化的诊断报告。

【平台概览】
- 注册用户: {users} 人
- 题目总量: {labs} 道（覆盖 {categories} 个知识类别）
- 累计对话: {conversations} 次
- 本周活跃率: {activeRate}%

【学员学习分布】
{leaderboard_table}  // markdown 表格，含进度/题目/对话数

【知识节点掌握热图】
{knowledge_coverage}  // 各类别已掌握节点数 vs 总节点数

【题型完成率统计】
{lab_type_stats}

【要求】
请严格按照以下 JSON 格式输出，不要输出其他内容：
{
  "score": <0-100 的系统健康分>,
  "grade": "<优秀|良好|待改善|预警>",
  "summary": "<2-3句综合结论>",
  "highlights": ["<正向发现1>", "<正向发现2>"],
  "risks": ["<风险点1>", "<风险点2>"],
  "suggestions": [
    { "priority": "高", "title": "<建议标题>", "detail": "<具体建议内容>" },
    ...
  ]
}
```

### 3.3 API Key 来源

从 `localStorage` 读取用户已保存的 API Key（与学员端聊天页相同机制），若未设置则弹出配置提示。

---

## 四、AI 诊断弹窗 UI 规格

### 4.1 组件位置

新建 `frontend/components/ai-diagnosis-modal.tsx`，在所有 admin 页面复用。

### 4.2 弹窗结构（分区设计）

```
┌─────────────────────────────────────────────────┐
│  [Sparkles] AI 智能运营诊断报告    [X 关闭]      │
│  数据快照: 2026-07-08 10:55 · 分析页面: 学员管理 │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐  健康评分: 78分（良好）            │
│  │  78      │  ───────────────────               │
│  │  [分圆]  │  本平台整体学习氛围良好，          │
│  └──────────┘  但部分知识节点存在覆盖盲区...     │
│                                                  │
├─────────────────────────────────────────────────┤
│  正向发现                                        │
│  [绿色 Badge] 全栈通关大师等高进度学员形成示范   │
│  [绿色 Badge] 题目通过率整体维持在 72% 以上      │
│                                                  │
│  待关注风险                                      │
│  [橙色 Badge] 6 名学员 30 天内零对话             │
│  [红色 Badge] 填空题通过率最低，仅 42%           │
│                                                  │
├─────────────────────────────────────────────────┤
│  改进建议 (按优先级)                             │
│  ┌─[高优先级]──────────────────────────────────┐│
│  │ 推送个性化复习提醒                           ││
│  │ 针对 30 天未活跃学员发起学习提醒推送...      ││
│  └─────────────────────────────────────────────┘│
│  ┌─[中优先级]──────────────────────────────────┐│
│  │ 增补填空类题目                               ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  [流式渲染进度条 ████████░░ 80%]                 │
│                                                  │
│             [重新分析]  [关闭]                   │
└─────────────────────────────────────────────────┘
```

### 4.3 视觉规格

| 元素 | 规格 |
|---|---|
| 弹窗宽度 | `max-w-2xl`，居中全屏遮罩 |
| 背景 | 白色 / `dark:bg-[#121424]` + 顶部 indigo-purple 渐变 accent 条 |
| 评分圆 | `w-20 h-20`，`bg-gradient-to-br from-indigo-500 to-purple-600` |
| 流式输出 | 打字机效果，带光标闪烁 |
| 正向发现 | `bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700` |
| 风险标签 | `bg-amber-50/orange-50 dark:bg-amber-950/20` |
| 建议卡片 | 高优先红色左边框，中优先橙色，低优先蓝色 |
| 动效 | 弹出用 `scale-95→scale-100 + opacity-0→1`，建议卡用 `stagger` 逐条进入 |

---

## 五、文件变更清单

### 新建文件
- `frontend/lib/mock-data.ts` — 全局共享 Mock 数据源
- `frontend/components/ai-diagnosis-modal.tsx` — AI 诊断弹窗组件

### 修改文件

| 文件 | 改动摘要 |
|---|---|
| `frontend/app/admin/page.tsx` | 数据源改为 import mock-data.ts；AI 诊断改用新弹窗组件 |
| `frontend/app/admin/students/page.tsx` | 合并 MOCK_STUDENTS 数据；加 AI 诊断按钮 |
| `frontend/app/admin/users/page.tsx` | 合并 MOCK_USERS 数据；加 AI 诊断按钮 |
| `frontend/app/admin/knowledge/page.tsx` | 注入 MOCK_KNOWLEDGE_ACTIVITY；加 AI 诊断按钮 |
| `frontend/app/admin/labs/page.tsx` | 注入 MOCK_LAB_SUBMISSIONS；加 AI 诊断按钮 |
| `frontend/app/admin/agents/page.tsx` | 注入 MOCK_AGENT_SESSIONS；加 AI 诊断按钮 |

---

## 六、验证计划

1. 各 admin 页面刷新后数据条数与 Dashboard 排行榜一致（均为 13 人）
2. AI 诊断弹窗可在**不启动后端**的情况下正常触发（需有效 API Key）
3. 弹窗流式输出不抛 JS 错误，解析 JSON 后各区块正确渲染
4. 页面在 Light / Dark 模式下均显示正常

---

[等待主人审核方案，请确认或提供修改意见以继续...]
