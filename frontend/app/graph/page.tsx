"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Sparkles,
  RefreshCw,
  Info,
  Loader2,
} from "lucide-react";
import { knowledgeApi } from "@/lib/api";
import UserLayout from "@/components/user-layout";

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

interface RecommendedNode {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  pagerank: number;
  proficiency: number;
  reason: string;
}

// 分类颜色映射
const CATEGORY_COLORS: Record<string, string> = {
  programming: "#3b82f6",
  dsa: "#ef4444",
  organization: "#10b981",
  os: "#06b6d4",
  network: "#8b5cf6",
  database: "#f59e0b",
  Other: "#6366f1",
};

export default function GraphPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendedNode[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
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

  const fetchRecommendations = useCallback(async () => {
    try {
      setRecLoading(true);
      const data = await knowledgeApi.recommendLearningPath();
      setRecommendations(data);
    } catch (error) {
      console.error("Failed to fetch recommendations:", error);
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraphData();
    fetchRecommendations();
  }, [fetchGraphData, fetchRecommendations]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleRefreshWeights = useCallback(async () => {
    try {
      setRefreshing(true);
      await knowledgeApi.computePageRank();
      await fetchGraphData();
      await fetchRecommendations();
    } catch (error) {
      console.error("Failed to refresh weights:", error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchGraphData, fetchRecommendations]);

  // ECharts 点击事件 — 跳转练习页
  const onChartClick = (params: { dataType: string; data: { nodeId?: string } }) => {
    if (params.dataType === "node" && params.data?.nodeId) {
      router.push(`/practice?nodeId=${params.data.nodeId}`);
    }
  };

  const chartEvents = {
    click: onChartClick,
  };

  // 构建 ECharts 数据
  const nodes = graphData?.nodes || [];
  const relations = graphData?.relations || [];

  const idToName: Record<string, string> = {};
  nodes.forEach((n) => {
    idToName[n.id] = n.name;
  });

  const maxPagerank = Math.max(...nodes.map((n) => n.pagerank_weight), 0.001);
  const processedData = nodes.map((node) => {
    const isLighted = node.is_lighted;
    const color = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.Other;
    const symbolSize = Math.max(
      16,
      Math.min(40, 16 + (node.pagerank_weight / maxPagerank) * 24)
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
            return `${node.name}<br/>分类: ${node.category}<br/>状态: <span style="color:${node.is_lighted ? "#22c55e" : "#ef4444"}">${node.is_lighted ? "● 已点亮" : "○ 未学习"}</span><br/>熟练度: ${Math.round(node.proficiency * 100)}%<br/><span style="color:#8b5cf6">点击进入练习</span>`;
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
          color: "rgba(99, 102, 231, 0.15)",
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
    <UserLayout activePath="/graph">
      <div className="flex-1 overflow-hidden bg-white dark:bg-[#0c0f1d] flex flex-col">

        <div className="p-8 pb-4 shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">知识图谱网络</h1>
          <p className="text-sm text-slate-500 mt-1">六大知识领域学习路线图，点击节点进入对应练习，通过答题点亮并解锁下一节点。</p>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 px-8 pb-8 gap-6">

          {/* Graph View */}
          <div className="flex-1 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6 relative flex flex-col min-h-0 shadow-inner">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 text-[10px] text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded border border-slate-100 dark:border-slate-800">
              <Info className="h-3.5 w-3.5 text-indigo-400" />
              <span>提示：点击节点进入练习</span>
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

          {/* Sidebar */}
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

            {/* Learning Path Recommendations */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800/60 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  学习路径推荐
                </h4>
                <button
                  onClick={handleRefreshWeights}
                  disabled={refreshing}
                  className="text-[10px] text-indigo-500 hover:text-indigo-600 flex items-center gap-1 disabled:opacity-50"
                  title="重新计算 PageRank 权重"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                  刷新权重
                </button>
              </div>
              {recLoading ? (
                <div className="text-[10px] text-slate-400 py-2 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  加载推荐...
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-1.5">
                  {recommendations.map((rec, idx) => {
                    const color = CATEGORY_COLORS[rec.category] || CATEGORY_COLORS.Other;
                    return (
                      <button
                        key={idx}
                        onClick={() => router.push(`/practice?nodeId=${rec.id}`)}
                        className="flex items-start gap-2 w-full p-2 rounded-lg text-left text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors"
                        title={rec.description}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{rec.name}</span>
                            <span className="text-[9px] font-mono text-slate-400 shrink-0">PR:{rec.pagerank.toFixed(3)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{rec.reason}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 py-2">暂无推荐</div>
              )}
            </div>

            {/* 节点清单 — 点击跳转练习 */}
            <div className="flex-1 overflow-y-auto min-h-[150px] border-t border-slate-200 dark:border-slate-800/60 pt-4">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">知识节点清单</h4>
              <div className="space-y-1.5">
                {nodes.map((node, idx) => {
                  const isLighted = node.is_lighted;
                  const color = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.Other;
                  return (
                    <button
                      key={idx}
                      onClick={() => router.push(`/practice?nodeId=${node.id}`)}
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

      </div>
    </UserLayout>
  );
}
