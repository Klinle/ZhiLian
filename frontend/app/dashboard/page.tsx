"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, RefreshCw, X, HelpCircle, GraduationCap } from "lucide-react";
import UserLayout from "@/components/user-layout";
import XpProgressBar from "@/components/xp-progress-bar";
import SkillTree from "@/components/skill-tree";
import StudyPanel from "@/components/study-panel";
import { knowledgeApi, profileApi } from "@/lib/api";
import { useChatAssistantStore } from "@/stores/chat-assistant";
import type { KnowledgeNode, RecommendedNode, ProfileStats } from "@/types";
import { CATEGORY_COLORS } from "@/components/skill-node";

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");

  // 数据 States
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [relations, setRelations] = useState<any[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [radar, setRadar] = useState<any>(null);
  const [recommends, setRecommends] = useState<RecommendedNode[]>([]);
  
  // 知识库分类切换
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [activeKbId, setActiveKbId] = useState<string>("");

  // 节点焦点聚焦
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);

  const openAssistant = useChatAssistantStore((state) => state.openAssistant);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
        return;
      }
      setNickname(localStorage.getItem("cognilink_user_nickname") || "学生");
    }
  }, [router]);

  // 并行获取首页所需的所有数据，支持传入知识库 ID 过滤
  const fetchDashboardData = useCallback(async (isRefresh = false, kbId = activeKbId) => {
    try {
      if (!isRefresh) setLoading(true);
      const [graphData, statsData, radarData, recommendsData] = await Promise.all([
        knowledgeApi.getGraph(kbId || undefined),
        profileApi.getStats(),
        profileApi.getRadar(),
        knowledgeApi.recommendLearningPath(),
      ]);

      setNodes(graphData.nodes || []);
      setRelations(graphData.relations || []);
      setStats(statsData);
      setRadar(radarData);
      setRecommends(recommendsData || []);
      
      if (selectedNode) {
        const freshNode = (graphData.nodes || []).find((n: KnowledgeNode) => n.id === selectedNode.id);
        if (freshNode) setSelectedNode(freshNode);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedNode, activeKbId]);

  useEffect(() => {
    if (mounted) {
      fetchDashboardData(false, activeKbId);
      // 并行拉取分类知识库列表
      knowledgeApi.listKnowledgeBases()
        .then((res) => {
          setKnowledgeBases(res || []);
        })
        .catch((err) => console.error("Failed to list knowledge bases:", err));
    }
  }, [mounted, activeKbId, fetchDashboardData]);

  // 蜂巢节点点击 — 直达练习页
  const handleNodeSelect = (node: KnowledgeNode) => {
    router.push(`/practice?nodeId=${node.id}`);
  };

  // 点击今日推荐列表节点
  const handleRecommendSelect = (nodeId: string) => {
    const nodeObj = nodes.find((n) => n.id === nodeId);
    if (nodeObj) {
      setSelectedNode(nodeObj);
      // 滚动技能树聚焦到此节点位置（可在以后的动画中平滑过渡）
    }
  };

  // 重新计算 PageRank 权重
  const handleRecomputePageRank = async () => {
    try {
      setLoading(true);
      await knowledgeApi.computePageRank();
      await fetchDashboardData(true);
    } catch (error) {
      console.error("Failed to compute PageRank weights:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <UserLayout activePath="/dashboard">
      {/* 外层容器：不整体滚动，flex-col 拉伸占满 */}
      <div className="flex-1 overflow-hidden bg-slate-50/20 dark:bg-zinc-950/10 flex flex-col">

        {/* 顶部固定区：Header 标题栏 + XP 进度条 */}
        <div className="shrink-0 px-6 pt-5 pb-3 flex flex-col gap-4 border-b border-gray-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
          {/* 头部标题与重算权重按钮 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-800 dark:text-zinc-100 flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-indigo-600" />
                自适应学习控制台
              </h1>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                通过图拓扑与多 Agent 协同，让计算机核心原理通俗易懂。
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* 知识库分类选择框 */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 font-medium">当前学习:</span>
                <select
                  value={activeKbId}
                  onChange={(e) => setActiveKbId(e.target.value)}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-gray-700 dark:text-zinc-300 transition-colors shadow-sm outline-none cursor-pointer min-w-[200px]"
                >
                  <option value="">🐍 Python 经典游戏实训大本营</option>
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      📚 {kb.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRecomputePageRank}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-slate-50 border border-gray-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 transition-colors shadow-sm cursor-pointer"
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
                重算 PageRank 学习曲线
              </button>
            </div>
          </div>

          {/* XP 进度条 */}
          {stats && <XpProgressBar stats={stats} nickname={nickname} />}
        </div>

        {/* 下方主体：左右双栏，各自独立滚动，flex-1 占满剩余高度 */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-xs text-gray-400">正在构建自适应技能树和雷达画像...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

            {/* 左侧：蜂巢技能树，独立 overflow-auto，撑满高度 */}
            <div className="flex-1 overflow-auto p-4 md:p-6 min-h-[500px] lg:min-h-0 relative">
              <SkillTree
                nodes={nodes}
                relations={relations}
                onNodeSelect={handleNodeSelect}
              />

              {/* 悬浮聚焦知识节点 Drawer/Card */}
              {selectedNode && (
                <div className="absolute bottom-4 left-4 z-20 w-80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-2xl p-4 shadow-xl flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <span
                        className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${CATEGORY_COLORS[selectedNode.category] || "#6366f1"}15`,
                          color: CATEGORY_COLORS[selectedNode.category] || "#6366f1",
                        }}
                      >
                        {
                          {
                            dsa: "益智游戏数据",
                            os: "实时动作并发",
                            network: "联机对战服务",
                            database: "数据与工程",
                            programming: "终端游戏与工具",
                            organization: "街机游戏设计",
                          }[selectedNode.category as "dsa" | "os" | "network" | "database" | "programming" | "organization"] || "其它领域"
                        }
                      </span>
                      <h4 className="font-extrabold text-sm text-gray-800 dark:text-zinc-100 mt-1">
                        {selectedNode.name}
                      </h4>
                    </div>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-gray-400 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
                    {selectedNode.description}
                  </p>
                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 dark:text-zinc-500 border-t border-gray-100 dark:border-zinc-800 pt-2.5">
                    <span>熟练度: {Math.round(selectedNode.proficiency)}%</span>
                    <span>学习时间: {(selectedNode.study_duration / 60).toFixed(1)} 小时</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => openAssistant(selectedNode.id, selectedNode.name)}
                      className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-600 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                    >
                      💬 向导师提问
                    </button>
                    <Link
                      href={`/practice?nodeId=${selectedNode.id}`}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all text-center cursor-pointer block"
                    >
                      🧪 前往练习
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：今日推荐 + Quiz + 雷达图，固定宽度 + 独立 overflow-y-auto */}
            <div className="lg:w-80 shrink-0 overflow-y-auto p-4 md:px-4 md:py-4 border-t lg:border-t-0 lg:border-l border-gray-200/60 dark:border-zinc-800/60">
              <StudyPanel
                recommendedNodes={recommends}
                radarData={radar}
                onSelectNode={handleRecommendSelect}
                onQuizPassed={() => fetchDashboardData(true)}
                selectedNodeId={selectedNode?.id}
              />
            </div>

          </div>
        )}

      </div>
    </UserLayout>
  );
}
