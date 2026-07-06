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

  // 并行获取首页所需的所有数据
  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const [graphData, statsData, radarData, recommendsData] = await Promise.all([
        knowledgeApi.getGraph(),
        profileApi.getStats(),
        profileApi.getRadar(),
        knowledgeApi.recommendLearningPath(),
      ]);

      setNodes(graphData.nodes || []);
      setRelations(graphData.relations || []);
      setStats(statsData);
      setRadar(radarData);
      setRecommends(recommendsData || []);
      
      // 如果当前聚焦了节点，刷新时同步更新该节点状态
      if (selectedNode) {
        const freshNode = (graphData.nodes || []).find((n: KnowledgeNode) => n.id === selectedNode.id);
        if (freshNode) setSelectedNode(freshNode);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (mounted) {
      fetchDashboardData();
    }
  }, [mounted]);

  // 技能树节点选中
  const handleNodeSelect = (node: KnowledgeNode) => {
    setSelectedNode(node);
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
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-zinc-950/10 flex flex-col gap-6 relative">
        
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
          
          <button
            onClick={handleRecomputePageRank}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-slate-50 border border-gray-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-zinc-300 transition-colors shadow-sm cursor-pointer"
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            重算 PageRank 学习曲线
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-xs text-gray-400">正在构建自适应技能树和雷达画像...</p>
          </div>
        ) : (
          <>
            {/* 顶部个人经验值与成就状态栏 */}
            {stats && <XpProgressBar stats={stats} nickname={nickname} />}

            {/* 下方左右双栏布局 */}
            <div className="flex-1 flex flex-col lg:flex-row gap-5 min-h-0 relative">
              
              {/* 左侧：蜂巢连线技能树 */}
              <div className="flex-1 relative min-h-[500px]">
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
                          {selectedNode.category === "dsa"
                            ? "数据结构"
                            : selectedNode.category === "os"
                            ? "操作系统"
                            : selectedNode.category === "network"
                            ? "计算机网络"
                            : selectedNode.category === "database"
                            ? "数据库"
                            : selectedNode.category === "programming"
                            ? "编程基础"
                            : "计算机组成"}
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

              {/* 右侧：今日推荐 + 快速 Quiz 挑战 + 雷达图 */}
              <StudyPanel
                recommendedNodes={recommends}
                radarData={radar}
                onSelectNode={handleRecommendSelect}
                onQuizPassed={() => fetchDashboardData(true)} // Quiz 通关刷新状态
              />

            </div>
          </>
        )}

      </div>
    </UserLayout>
  );
}
