"""
LangGraph 多 Agent 协同工作流服务
- 基于 StateGraph 编排 Orchestrator → RagBot/GraphBot/OpsBot → Reviewer 工作流
- 支持任务分解、中间结果传递、交叉审查
"""

from typing import TypedDict, Any, Optional

from langgraph.graph import StateGraph, END


class AgentState(TypedDict, total=False):
    """
    LangGraph 工作流状态定义

    所有节点共享此状态，通过读取和更新字段实现协同。
    total=False 允许字段渐进式填充（不必同时存在所有字段）。
    """

    messages: list                    # 对话历史
    user_id: str                      # 用户ID
    user_cognitive_state: dict        # 用户认知画像（P1阶段填充）
    sub_tasks: list                   # Orchestrator 分解的子任务列表
    agent_results: dict               # 各 Agent 的中间结果 {"rag": ..., "langgraph": ...}
    final_answer: str                 # 最终聚合结果
    needs_review: bool                # 是否需要交叉审查
    api_key: str                      # LLM API Key
    model: str                        # 模型名
    base_url: Optional[str]           # 自定义 API 地址
    session: Any                      # 数据库会话（RagBot 检索需要）
    user_message: str                 # 当前用户消息


class GraphService:
    """LangGraph 多 Agent 协同工作流服务"""

    def __init__(self):
        self._app = None

    def _build_workflow(self):
        """
        构建 LangGraph StateGraph 工作流

        工作流拓扑：
        Orchestrator → (条件路由) → RagBot / GraphBot / OpsBot → Reviewer → END

        Returns:
            编译后的 LangGraph 可执行 app
        """
        # T6-T11 逐步实现各节点和路由
        workflow = StateGraph(AgentState)
        # 节点和边将在后续任务中添加
        return workflow.compile()

    async def run(self, state: AgentState) -> AgentState:
        """
        执行多 Agent 协同工作流

        Args:
            state: 初始状态（包含 user_message, api_key, model 等）

        Returns:
            最终状态（包含 final_answer）
        """
        if self._app is None:
            self._app = self._build_workflow()
        result = await self._app.ainvoke(state)
        return result


# 全局实例
graph_service = GraphService()
