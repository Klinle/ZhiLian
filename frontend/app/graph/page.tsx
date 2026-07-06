"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  MessageSquare,
  BookOpen,
  Brain,
  Grid3X3,
  Shield,
  Activity,
  Network,
  Award,
  Sparkles,
  RefreshCw,
  Info,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, getAuthHeaders, knowledgeApi } from "@/lib/api";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface GraphNode {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  pagerank_weight: number;
  is_lighted: boolean;
  proficiency: number;
  study_duration: number;
}

interface GraphRelation {
  source: string;
  target: string;
  relation_type: string;
}

interface GraphData {
  nodes: GraphNode[];
  relations: GraphRelation[];
  stats: {
    total_nodes: number;
    lighted_nodes: number;
    categories: Record<string, { total: number; lighted: number }>;
  };
}

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  RAG: "#3b82f6",
  LangGraph: "#a855f7",
  LLMOps: "#10b981",
  Other: "#6366f1",
};

export default function GraphPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
      } else {
        setUserRole(localStorage.getItem("cognilink_user_role") || "student");
      }
    }
  }, [router]);

  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await knowledgeApi.getGraph();
      setGraphData(data);
    } catch (error) {
      console.error("Failed to fetch graph data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleToggleNode = useCallback(
    async (nodeId: string) => {
      try {
        const result = await knowledgeApi.toggleNodeLight(nodeId);
        // Update local state
        setGraphData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nodes: prev.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    is_lighted: result.is_lighted,
                    proficiency: result.proficiency,
                  }
                : n
            ),
            stats: {
              ...prev.stats,
              lighted_nodes: prev.nodes.filter(
                (n, _idx) =>
                  n.id === nodeId ? result.is_lighted : n.is_lighted
              ).length,
            },
          };
        });
      } catch (error) {
        console.error("Failed to toggle node:", error);
      }
    },
    []
  );

  const handleLightAll = useCallback(async () => {
    if (!graphData) return;
    // Light all unlighted nodes
    const unlighted = graphData.nodes.filter((n) => !n.is_lighted);
    for (const node of unlighted) {
      try {
        await knowledgeApi.toggleNodeLight(node.id, true);
      } catch {
        // continue
      }
    }
    await fetchGraphData();
  }, [graphData, fetchGraphData]);

  const handleReset = useCallback(async () => {
    if (!graphData) return;
    // Unlight all nodes
    const lighted = graphData.nodes.filter((n) => n.is_lighted);
    for (const node of lighted) {
      try {
        await knowledgeApi.toggleNodeLight(node.id, false);
      } catch {
        // continue
      }
    }
    await fetchGraphData();
  }, [graphData, fetchGraphData]);

  // ECharts click event handler
  const onChartClick = (params: { dataType: string; data: { nodeId?: string } }) => {
    if (params.dataType === "node" && params.data?.nodeId) {
      const node = graphData?.nodes.find((n) => n.id === params.data.nodeId);
      if (node) {
        setSelectedNode(node);
        handleToggleNode(node.id);
      }
    }
  };

  const chartEvents = {
    click: onChartClick,
  };

  // Build ECharts data from graphData
  const nodes = graphData?.nodes || [];
  const relations = graphData?.relations || [];

  // Create id->name mapping for links
  const idToName: Record<string, string> = {};
  nodes.forEach((n) => {
    idToName[n.id] = n.name;
  });

  const processedData = nodes.map((node) => {
    const isLighted = node.is_lighted;
    const color = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.Other;
    const symbolSize = Math.max(
      16,
      Math.min(40, 16 + node.pagerank_weight * 12)
    );
    return {
      nodeId: node.id,
      name: node.name,
      symbolSize,
      category: node.category,
      itemStyle: {
        color: isLighted ? color : "rgba(100, 116, 139, 0.4)",
        shadowBlur: isLighted ? 15 : 0,
        shadowColor: color,
        borderColor: isLighted ? "rgba(255, 255, 255, 0.4)" : "transparent",
        borderWidth: isLighted ? 2 : 0,
      },
      label: {
        show: true,
        color: isLighted
          ? typeof window !== "undefined" &&
            document.documentElement.classList.contains("dark")
            ? "#fff"
            : "#1e293b"
          : "#94a3b8",
      },
    };
  });

  const links = relations
    .map((r) => {
      const sourceName = idToName[r.source];
      const targetName = idToName[r.target];
      if (!sourceName || !targetName) return null;
      return { source: sourceName, target: targetName };
    })
    .filter((l): l is { source: string; target: string } => l !== null);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "rgba(18, 20, 36, 0.9)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 },
      formatter: (params: { dataType: string; name: string; data: { source?: string; target?: string; category?: string } }) => {
        if (params.dataType === "node") {
          const node = nodes.find((n) => n.name === params.name);
          if (node) {
            return `${node.name}<br/>分类: ${node.category}<br/>状态: <span style="color:${node.is_lighted ? "#22c55e" : "#ef4444"}">${node.is_lighted ? "● 已点亮" : "○ 未学习"}</span><br/>熟练度: ${Math.round(node.proficiency * 100)}%`;
          }
          return params.name;
        }
        return `关联路径: ${params.data.source} → ${params.data.target}`;
      },
    },
    series: [
      {
        type: "graph",
        layout: "force",
        data: processedData,
        links: links,
        roam: true,
        label: {
          show: true,
          position: "bottom",
          fontSize: 10,
          fontFamily: "sans-serif",
        },
        force: {
          repulsion: 220,
          edgeLength: 70,
          gravity: 0.1,
        },
        lineStyle: {
          color: "rgba(99, 102, 241, 0.15)",
          width: 1.5,
          curveness: 0.1,
        },
        emphasis: {
          focus: "adjacency",
          lineStyle: {
            width: 3,
            color: "#6366f1",
          },
        },
      },
    ],
  };

  const lightedCount = nodes.filter((n) => n.is_lighted).length;
  const totalCount = nodes.length;
  const lightedPercent = totalCount > 0 ? Math.round((lightedCount / totalCount) * 100) : 0;

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-[#0c0f1d] text-slate-800 dark:text-slate-100 font-sans">

      {/* Sidebar 侧边栏 */}
      <aside className="w-72 bg-[#f9f9f9] dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col shrink-0">

        {/* Role Switcher Button */}
        {userRole === "admin" || userRole === "teacher" ? (
          <div className="px-4 pt-4 pb-0">
            <Link
              href="/admin"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 hover:bg-indigo-650 hover:text-white transition-all text-xs font-semibold text-indigo-650 dark:text-indigo-400"
            >
              <Shield className="h-4 w-4 shrink-0" />
              切换至管理后台
            </Link>
          </div>
        ) : null}

        {/* New Chat Entrance */}
        <div className="p-4">
          <Link
            href="/chat"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <MessageSquare className="h-4 w-4 text-gray-500" />
            开始新聊天
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          <div className="px-1 py-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">系统功能</p>
          </div>

          <Link
            href="/knowledge"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            知识库
          </Link>
          <Link
            href="/memories"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Brain className="h-4 w-4" />
            记忆
          </Link>

          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Activity className="h-4 w-4 text-indigo-500" />
            学习画像
          </Link>
          <Link
            href="/graph"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer w-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 font-semibold"
          >
            <Network className="h-4 w-4 text-purple-500" />
            知识图谱
          </Link>
          <Link
            href="/practice"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Award className="h-4 w-4 text-emerald-500" />
            在线练习
          </Link>

          <Link
            href="/chat"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Grid3X3 className="h-4 w-4" />
            首页
          </Link>
        </nav>

        {/* User Session Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 text-xs bg-gray-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              U
            </div>
            <div className="truncate text-gray-700 dark:text-gray-300">
              <span className="font-semibold block truncate leading-tight">
                {typeof window !== "undefined" ? localStorage.getItem("cognilink_user_nickname") || "未登录" : "加载中"}
              </span>
              <span className="text-[10px] text-gray-400 block mt-0.5 capitalize">
                {typeof window !== "undefined" ? localStorage.getItem("cognilink_user_role") || "student" : "student"}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm("确认退出登录？")) {
                localStorage.removeItem("cognilink_token");
                localStorage.removeItem("cognilink_user_id");
                localStorage.removeItem("cognilink_user_role");
                localStorage.removeItem("cognilink_user_nickname");
                document.cookie = "cognilink_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                router.push("/login");
              }
            }}
            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

      </aside>

      {/* Main Panel */}
      <main className="flex-1 overflow-hidden bg-white dark:bg-[#0c0f1d] flex flex-col">

        {/* Header Title */}
        <div className="p-8 pb-4 shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">知识图谱网络</h1>
          <p className="text-sm text-slate-500 mt-1">这里展示了系统知识库关联图谱，会根据您的学习情况进行点亮。</p>
        </div>

        {/* Workspace Panels */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 px-8 pb-8 gap-6">

          {/* Graph View Card */}
          <div className="flex-1 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6 relative flex flex-col min-h-0 shadow-inner">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 text-[10px] text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded border border-slate-100 dark:border-slate-800">
              <Info className="h-3.5 w-3.5 text-indigo-400" />
              <span>提示：点击节点可点亮该知识点</span>
            </div>

            <div className="flex-1 min-h-[400px] relative">
              {loading ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>加载知识图谱...</span>
                </div>
              ) : mounted && nodes.length > 0 ? (
                <ReactECharts
                  option={option}
                  onEvents={chartEvents}
                  style={{ height: "100%", width: "100%", minHeight: "400px" }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">暂无知识图谱数据</div>
              )}
            </div>
          </div>

          {/* Interactive Controller sidebar panel */}
          <div className="w-full lg:w-80 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6 flex flex-col gap-6 shrink-0 shadow-sm overflow-y-auto">
            <div>
              <h3 className="font-bold text-sm text-slate-850 dark:text-white">学习掌握进度</h3>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 bg-slate-200 dark:bg-slate-850 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 rounded-full"
                    style={{ width: `${lightedPercent}%` }}
                  />
                </div>
                <span className="font-bold font-mono text-xs">{lightedPercent}%</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">已点亮 {lightedCount} / {totalCount} 个知识模块</p>
            </div>

            {/* Category Stats */}
            {graphData?.stats?.categories && (
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800/60 pt-4">
                <h4 className="text-xs font-semibold text-slate-500 mb-2">分类掌握情况</h4>
                {Object.entries(graphData.stats.categories).map(([cat, data]) => {
                  const catPercent = data.total > 0 ? Math.round((data.lighted / data.total) * 100) : 0;
                  const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
                  return (
                    <div key={cat} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{cat}</span>
                      <span className="font-mono text-slate-400">{data.lighted}/{data.total}</span>
                      <span className="font-mono text-slate-400 w-8 text-right">{catPercent}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800/60 pt-4">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">快捷操作</h4>
              <Button
                onClick={handleLightAll}
                disabled={loading}
                className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-9 font-medium"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                点亮全部知识点
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                disabled={loading}
                className="w-full text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2b2f4f] hover:bg-slate-100 dark:hover:bg-slate-800 h-9 font-medium"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                重置点亮状态
              </Button>
            </div>

            {/* Nodes toggle checklist */}
            <div className="flex-1 overflow-y-auto min-h-[150px] border-t border-slate-200 dark:border-slate-800/60 pt-4">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">知识节点清单</h4>
              <div className="space-y-1.5">
                {nodes.map((node, idx) => {
                  const isLighted = node.is_lighted;
                  const color = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.Other;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleToggleNode(node.id)}
                      className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors border ${
                        isLighted
                          ? "bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-950 text-slate-850 dark:text-white"
                          : "bg-transparent border-transparent text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-850/50"
                      }`}
                      title={node.description}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isLighted ? color : "#cbd5e1" }} />
                        <span className="truncate">{node.name}</span>
                      </div>
                      {isLighted && (
                        <span className="text-[9px] font-mono text-slate-400 shrink-0 ml-2">
                          {Math.round(node.proficiency * 100)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
