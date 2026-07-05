import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import async_session_maker
from models.database import KnowledgeNode, KnowledgeRelation, Agent, Lab, User
from core.security import get_password_hash

async def seed_all_data():
    async with async_session_maker() as session:
        # 0. [SuperAdmin] 幽寂注入超级管理员账号 Kleinle
        stmt_admin = select(User).where(User.username == "Kleinle")
        res_admin = await session.execute(stmt_admin)
        if res_admin.scalars().first() is None:
            super_admin = User(
                username="Kleinle",
                hashed_password=get_password_hash("123456"),
                nickname="Kleinle (SuperAdmin)",
                role="admin"
            )
            session.add(super_admin)
            await session.commit()
            print("[Seed] SuperAdmin account 'Kleinle' created.")
        else:
            print("[Seed] SuperAdmin 'Kleinle' already exists. Skip.")

        # 1. 检查是否已经注入过知识图谱数据
        stmt = select(KnowledgeNode).limit(1)
        result = await session.execute(stmt)
        if result.scalars().first() is not None:
            print("[Seed] Database seed data already exists. Skip.")
            return

        print("[Seed] Start injecting CogniLink seed data...")

        # 2. 注入智能导师 Agent
        mentors = [
            Agent(
                name="RAG 实训导师 (RagBot)",
                role_type="rag_mentor",
                description="专门指导混合检索、切块策略及 pgvector 优化部署的大模型应用实训导师。",
                system_prompt="你是一位资深的 RAG 架构师与教学导师。你的任务是帮助学员解决混合 RAG 的分块 (Chunking)、多路召回 (Hybrid Retrieval)、重排 (Reranking) 及向量数据库 (pgvector) 开发难题。请循循善诱，使用大厂资深全栈专家的口吻，结合代码和架构图逻辑解答问题。"
            ),
            Agent(
                name="LangGraph 状态机导师 (GraphBot)",
                role_type="langgraph_mentor",
                description="专门负责指导 LangGraph 状态定义、循环流转、状态还原及多智能体路由的设计导师。",
                system_prompt="你是一位 LangGraph 状态机与多智能体开发大师。你负责指导学员攻克状态定义 (State/Reducer)、节点逻辑 (Nodes)、条件边分支路由 (Conditional Edges) 及状态持久化等 LangGraph 状态机核心难题。请用严谨、逻辑清晰的教学口吻提供解惑与实操代码调试建议。"
            ),
            Agent(
                name="LLMOps 实训助教 (OpsBot)",
                role_type="llmops_mentor",
                description="协助学员掌握大模型应用工程化评测、监控与部署的实操助教。",
                system_prompt="你是 LLMOps 应用工程化评测助教。主要指导学员对 RAG 系统及智能体工作流进行召回率评测、指令鲁棒性测试、性能监控以及容器化部署。引导他们通过数据指标评估模型质量。"
            )
        ]
        session.add_all(mentors)
        await session.flush()

        # 3. 注入知识图谱节点 (RAG + LangGraph)
        nodes = {
            "RAG_INTRO": KnowledgeNode(
                code="RAG_INTRO",
                name="RAG 基础概念",
                category="RAG",
                description="检索增强生成（RAG）的基本原理、三阶段工作流（准备、检索、生成）以及常用开发套件框架基础。",
                pagerank_weight=1.0
            ),
            "RAG_CHUNKING": KnowledgeNode(
                code="RAG_CHUNKING",
                name="文档分块策略",
                category="RAG",
                description="字符分块、基于 Token 的分块以及高级语义分块；切块重叠 (Overlap) 对检索上下文连贯性的影响。",
                pagerank_weight=1.2
            ),
            "RAG_EMBEDDINGS": KnowledgeNode(
                code="RAG_EMBEDDINGS",
                name="向量检索与 Embedding",
                category="RAG",
                description="向量表示原理、常用 Embedding 提取、余弦相似度与内积运算、高维空间的检索瓶颈。",
                pagerank_weight=1.3
            ),
            "RAG_VECTORDB": KnowledgeNode(
                code="RAG_VECTORDB",
                name="pgvector 向量库应用",
                category="RAG",
                description="PostgreSQL 中的 pgvector 拓展，HNSW 与 IVFFlat 向量索引的工作原理、创建及近似最近邻搜索优化。",
                pagerank_weight=1.5
            ),
            "RAG_HYBRID": KnowledgeNode(
                code="RAG_HYBRID",
                name="混合多路召回",
                category="RAG",
                description="稀疏检索 (BM25) 与稠密向量检索的结合，倒排索引与向量距离的分数融合 (RRF 倒数排名融合) 及多路合并召回策略。",
                pagerank_weight=1.8
            ),
            "RAG_RERANK": KnowledgeNode(
                code="RAG_RERANK",
                name="重排过滤 (Reranking)",
                category="RAG",
                description="交叉编码器 (Cross-Encoder) 的工作机制、利用重排模型过滤无关上下文、优化检索噪声与输入 Token 成本。",
                pagerank_weight=1.6
            ),
            
            "LG_INTRO": KnowledgeNode(
                code="LG_INTRO",
                name="LangGraph 状态机概念",
                category="LangGraph",
                description="使用图拓扑定义复杂大模型应用，节点 (Node) 作为执行单元，边 (Edge) 控制流程的图设计思想。",
                pagerank_weight=1.0
            ),
            "LG_STATE": KnowledgeNode(
                code="LG_STATE",
                name="State 状态定义与 Reducer",
                category="LangGraph",
                description="通道定义、共享状态的设计，Reducer 聚合函数的作用与多节点并发状态更新时的合并机制。",
                pagerank_weight=1.4
            ),
            "LG_NODES": KnowledgeNode(
                code="LG_NODES",
                name="Node 节点设计",
                category="LangGraph",
                description="将普通的 Python 异步函数封装为状态机节点，调用大模型或工具，并更新 State 的规范流。",
                pagerank_weight=1.2
            ),
            "LG_EDGES": KnowledgeNode(
                code="LG_EDGES",
                name="边与有条件路由 (Edges)",
                category="LangGraph",
                description="无条件连接与有条件边 (Conditional Edges) 的路由函数设计，控制智能体判定循环和终止退出条件。",
                pagerank_weight=1.6
            ),
            "LG_PERSIST": KnowledgeNode(
                code="LG_PERSIST",
                name="状态持久化与断点控制",
                category="LangGraph",
                description="使用内存或 PostgreSQL 检查点存储器 (SqliteSaver/PostgresSaver) 对对话状态机归档与人工确认 (Human-in-the-loop) 阻断控制。",
                pagerank_weight=1.7
            )
        }
        
        session.add_all(nodes.values())
        await session.flush()  # 获得节点的 UUID id

        # 4. 注入知识图谱依赖关系 (边)
        relations = [
            # RAG 链条
            KnowledgeRelation(source_node_id=nodes["RAG_INTRO"].id, target_node_id=nodes["RAG_CHUNKING"].id),
            KnowledgeRelation(source_node_id=nodes["RAG_INTRO"].id, target_node_id=nodes["RAG_EMBEDDINGS"].id),
            KnowledgeRelation(source_node_id=nodes["RAG_EMBEDDINGS"].id, target_node_id=nodes["RAG_VECTORDB"].id),
            KnowledgeRelation(source_node_id=nodes["RAG_VECTORDB"].id, target_node_id=nodes["RAG_HYBRID"].id),
            KnowledgeRelation(source_node_id=nodes["RAG_HYBRID"].id, target_node_id=nodes["RAG_RERANK"].id),
            
            # LangGraph 链条
            KnowledgeRelation(source_node_id=nodes["LG_INTRO"].id, target_node_id=nodes["LG_STATE"].id),
            KnowledgeRelation(source_node_id=nodes["LG_INTRO"].id, target_node_id=nodes["LG_NODES"].id),
            KnowledgeRelation(source_node_id=nodes["LG_STATE"].id, target_node_id=nodes["LG_EDGES"].id),
            KnowledgeRelation(source_node_id=nodes["LG_NODES"].id, target_node_id=nodes["LG_EDGES"].id),
            KnowledgeRelation(source_node_id=nodes["LG_EDGES"].id, target_node_id=nodes["LG_PERSIST"].id),
        ]
        session.add_all(relations)

        # 5. 注入初始实操实训 Labs
        labs = [
            Lab(
                title="混合检索 RRF (Reciprocal Rank Fusion) 核心算法实现",
                description="实操目标: 编写 RRF 分数聚合算法。输入来自 BM25 (稀疏) 与 Vector (稠密) 的多路召回候选列表，将其倒数分合并重排，返回前 K 个最高分数的结果。测试验证算法的鲁棒性。",
                starter_code="""def rrf_score(dense_results: list, sparse_results: list, k: int = 60, top_n: int = 5) -> list:
    # dense_results 结构: [{"doc_id": "1", "score": 0.9}, {"doc_id": "2", "score": 0.8}]
    # sparse_results 结构: [{"doc_id": "2", "score": 12.5}, {"doc_id": "3", "score": 10.1}]
    # 请在此处实现倒数排名分数融合，并按分数降序返回前 top_n 个文档 doc_id 列表。
    pass
""",
                test_cases={
                    "test_dense": [{"doc_id": "1", "score": 0.95}, {"doc_id": "2", "score": 0.85}],
                    "test_sparse": [{"doc_id": "2", "score": 15.0}, {"doc_id": "3", "score": 8.0}],
                    "expected_top": ["2", "1", "3"]
                },
                node_id=nodes["RAG_HYBRID"].id,
                difficulty="medium"
            ),
            Lab(
                title="LangGraph 循环纠错条件边 (Conditional Edge) 实现",
                description="实操目标: 定义一个条件路由函数，用来检查 LLM 输出代码的编译状态。如果代码没有通过测试用例 (Passed = False)，路由将重新指向 'coder' 节点进行修改；若通过，指向结束 (END)。以此实现智能体自我反思纠错环路。",
                starter_code="""def route_code_check(state: dict) -> str:
    # state 包含 keys: 'code', 'tests_passed'
    # 请在此处编写条件边判定逻辑:
    # 1. 如果 tests_passed 为 True，返回 "END" (路由结束)
    # 2. 如果 tests_passed 为 False，返回 "coder" (重新路由至修改节点)
    pass
""",
                test_cases={
                    "state_true": {"code": "print('ok')", "tests_passed": True},
                    "state_false": {"code": "prnt('ok')", "tests_passed": False}
                },
                node_id=nodes["LG_EDGES"].id,
                difficulty="hard"
            )
        ]
        session.add_all(labs)

        await session.commit()
        print("[Seed] CogniLink seed data injected successfully!")

if __name__ == "__main__":
    # 支持脚本单独运行进行初始化
    asyncio.run(seed_all_data())
