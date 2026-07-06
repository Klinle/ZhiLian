# 知链 · CogniLink

> **大模型应用工程敏捷实训系统**
> 基于"用多智能体技术培养多智能体开发人才"的教学逻辑，为高校、转岗及企业内训人员提供一站式、自适应的 LLMOps 智慧学习与代码实操平台。

---

## 核心愿景

通过图拓扑 PageRank 算法拟合学习曲线，助力开发者攻克 **混合 RAG** 与 **LangGraph 状态机** 开发大关。

## 技术栈

| 层次 | 技术 |
|---|---|
| 前端 | Next.js 16 · TypeScript · Tailwind CSS |
| 后端 | FastAPI · SQLAlchemy (Async) · PostgreSQL + pgvector |
| 认证 | JWT (PyJWT) · bcrypt |
| AI | OpenAI / LiteLLM · RAG · LangGraph |
| 部署 | Docker Compose |

---

## 项目结构

```
ZhiLian/
├── frontend/          # Next.js 前端
│   ├── app/           # App Router 页面
│   ├── components/    # 公共组件
│   └── lib/           # API 工具 & 工具函数
├── backend/           # FastAPI 后端
│   ├── api/           # 路由接口
│   ├── core/          # 配置 / 数据库 / 安全
│   ├── models/        # SQLAlchemy 模型
│   ├── services/      # 业务逻辑层
│   └── seed_data.py   # 种子数据（自动幂等注入）
├── docker-compose.yml # PostgreSQL + pgvector
└── .gitignore
```

---

## 快速启动

### 1. 启动数据库

```bash
docker-compose up -d
```

### 2. 启动后端

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:3000`，使用管理员账号登录：

- 用户名：`Kleinle`
- 密码：`123456`

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

## 环境变量

复制 `.env.example` 并填写配置：

```bash
cp .env.example .env
```

`.env` 已在 `.gitignore` 中排除，请勿提交到仓库。

---

*Private repository — All rights reserved by Klinle.*
