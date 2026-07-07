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
  Zap,
  Clock,
  CheckCircle2,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  Lock,
} from "lucide-react";
import { profileApi, knowledgeApi } from "@/lib/api";
import { KnowledgeNode } from "@/types";
import UserLayout from "@/components/user-layout";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface ProfileStats {
  lighted_nodes: number;
  total_nodes: number;
  pass_rate: number;
  passed_labs: number;
  total_submissions: number;
  study_duration_hours: number;
  memory_count: number;
}

interface RadarData {
  indicators: { name: string; max: number }[];
  values: {
    direction: string;
    coverage: number;
    proficiency: number;
    lighted: number;
    total: number;
  }[];
}

export default function ProfilePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [radar, setRadar] = useState<RadarData | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");

  const categoryMapping: Record<string, { label: string, color: string }> = {
    "programming": { label: "终端游戏与工具", color: "bg-blue-500" },
    "dsa": { label: "益智游戏数据", color: "bg-emerald-500" },
    "organization": { label: "街机游戏设计", color: "bg-amber-500" },
    "os": { label: "实时动作并发", color: "bg-purple-500" },
    "network": { label: "联机对战服务", color: "bg-cyan-500" },
    "database": { label: "数据与工程", color: "bg-rose-500" }
  };

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

  const fetchProfileData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, radarData, graphData] = await Promise.all([
        profileApi.getStats(),
        profileApi.getRadar(),
        knowledgeApi.getGraph(),
      ]);
      setStats(statsData);
      setRadar(radarData);
      setNodes(graphData.nodes || []);
    } catch (error) {
      console.error("Failed to fetch profile data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Build radar chart option from API data
  const radarOption = radar
    ? {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(18, 20, 36, 0.9)",
          borderWidth: 1,
          borderColor: "rgba(99, 102, 241, 0.3)",
          textStyle: { color: "#fff", fontSize: 11 },
        },
        radar: {
          indicator: radar.indicators.map((ind) => ({
            name: ind.name,
            max: ind.max,
          })),
          shape: "polygon" as const,
          radius: "60%",
          axisName: {
            color: "#94a3b8",
            fontSize: 10,
            fontWeight: "bold",
            fontFamily: "sans-serif",
          },
          splitArea: {
            areaStyle: {
              color: [
                "rgba(99, 102, 241, 0.01)",
                "rgba(99, 102, 241, 0.03)",
                "rgba(99, 102, 241, 0.05)",
                "rgba(99, 102, 241, 0.08)",
                "rgba(99, 102, 241, 0.12)",
              ],
              shadowColor: "rgba(0, 0, 0, 0.2)",
              shadowBlur: 10,
            },
          },
          axisLine: {
            lineStyle: { color: "rgba(99, 102, 241, 0.15)" },
          },
          splitLine: {
            lineStyle: { color: "rgba(99, 102, 241, 0.12)" },
          },
        },
        series: [
          {
            name: "能力维度画像",
            type: "radar",
            data: [
              {
                value: radar.values.map((v) => v.coverage),
                name: "知识覆盖率 (%)",
                symbol: "circle",
                symbolSize: 4,
                itemStyle: { color: "#818cf8" },
                areaStyle: {
                  color: {
                    type: "linear" as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(129, 140, 248, 0.6)" },
                      { offset: 1, color: "rgba(99, 102, 241, 0.1)" },
                    ],
                  },
                },
                lineStyle: { width: 2, color: "#818cf8" },
              },
              {
                value: radar.values.map((v) => v.proficiency),
                name: "平均熟练度 (%)",
                symbol: "circle",
                symbolSize: 4,
                itemStyle: { color: "#34d399" },
                areaStyle: {
                  color: {
                    type: "linear" as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(52, 211, 153, 0.4)" },
                      { offset: 1, color: "rgba(16, 185, 129, 0.1)" },
                    ],
                  },
                },
                lineStyle: { width: 2, color: "#34d399" },
              },
            ],
          },
        ],
      }
    : null;

  return (
    <UserLayout activePath="/profile">
      {/* Main Panel */}
      <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-[#0c0f1d] flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">学习能力画像与进度</h1>
          <p className="text-sm text-slate-500 mt-1">评估您在知识库中的学习进度和多维度智能召回画像。</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="text-sm text-slate-400 ml-2">加载学习数据...</span>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

              <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-2xl font-bold font-mono">
                    {stats ? `${stats.lighted_nodes} / ${stats.total_nodes}` : "0 / 0"}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">已点亮知识点数</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-2xl font-bold font-mono">
                    {stats ? `${stats.pass_rate}%` : "0%"}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">实验通过率 ({stats?.passed_labs || 0}/{stats?.total_submissions || 0})</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-2xl font-bold font-mono">
                    {stats ? `${stats.study_duration_hours} 小时` : "0 小时"}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">累计学习时长</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-2xl font-bold font-mono">
                    {stats ? stats.memory_count : 0}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">语义记忆条目数</p>
                </div>
              </div>

            </div>

            {/* Charts Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* Ability Radar */}
              <div className="lg:col-span-2 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-5 h-[340px] flex flex-col">
                <h3 className="text-xs font-bold text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  当前能力维度画像
                </h3>
                <div className="flex-1 min-h-[250px] relative">
                  {mounted && radarOption ? (
                    <ReactECharts option={radarOption} style={{ height: "100%", width: "100%", minHeight: "250px" }} />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">雷达图生成中...</div>
                  )}
                </div>
              </div>

              {/* Direction Details */}
              <div className="lg:col-span-3 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-5 h-[340px] flex flex-col overflow-y-auto">
                <h3 className="text-xs font-bold text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  六大核心领域进度
                </h3>
                <div className="flex-1 space-y-4">
                  {radar?.values.map((v) => (
                    <div key={v.direction} className="bg-white dark:bg-slate-900/60 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{v.direction}</span>
                        <span className="text-xs font-mono text-slate-400">
                          {v.lighted}/{v.total} 节点 · 熟练度 {v.proficiency}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 rounded-full"
                            style={{ width: `${v.coverage}%` }}
                          />
                        </div>
                        <span className="font-bold font-mono text-xs text-slate-500">{v.coverage}%</span>
                      </div>
                    </div>
                  ))}
                  {(!radar || radar.values.length === 0) && (
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                      暂无能力维度数据
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Detailed Nodes Section */}
            <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6 flex flex-col gap-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Network className="h-4 w-4 text-indigo-500" />
                  六大核心领域细分知识点图谱
                </h3>
                <p className="text-xs text-slate-400 mt-1">查看每个具体知识节点的点亮状态与掌握进度详情</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(categoryMapping).map(([catKey, catInfo]) => {
                  const catNodes = nodes.filter((n) => n.category === catKey);
                  const lightedCount = catNodes.filter((n) => n.is_lighted).length;
                  const isExpanded = expandedCategory === catKey;

                  return (
                    <div
                      key={catKey}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-[#1f233a] rounded-xl overflow-hidden transition-all duration-300 shadow-sm"
                    >
                      {/* Category Header */}
                      <button
                        onClick={() => setExpandedCategory(isExpanded ? null : catKey)}
                        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${catInfo.color}`} />
                          <div>
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                              {catInfo.label}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              已点亮 {lightedCount} / {catNodes.length} 节点
                            </span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>

                      {/* Category Details */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800/60 p-4 bg-slate-50/40 dark:bg-slate-950/10 space-y-2 max-h-80 overflow-y-auto">
                          {catNodes.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">该分类下暂无知识节点</p>
                          ) : (
                            catNodes.map((node) => (
                              <div
                                key={node.id}
                                className={`p-3 rounded-lg border transition-all ${
                                  node.is_lighted
                                    ? "bg-white dark:bg-slate-900/60 border-slate-100 dark:border-slate-800"
                                    : "bg-slate-50/50 dark:bg-slate-900/20 border-dashed border-slate-200 dark:border-slate-800/40 opacity-70"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5 min-w-0">
                                    <div className="mt-0.5 shrink-0">
                                      {node.is_lighted ? (
                                        <div className="p-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 border border-emerald-100 dark:border-emerald-900/40">
                                          <Check className="h-3 w-3" />
                                        </div>
                                      ) : (
                                        <div className="p-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200/50 dark:border-slate-700/40">
                                          <Lock className="h-3 w-3" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <h5 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                        {node.name}
                                        <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                          {node.code}
                                        </span>
                                      </h5>
                                      <p className="text-[10px] text-slate-400 mt-1 leading-normal line-clamp-2">
                                        {node.description}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-bold font-mono text-indigo-650 dark:text-indigo-400">
                                      熟练度 {node.proficiency}%
                                    </span>
                                    <span className="text-[9px] text-slate-400 block mt-0.5">
                                      时长 {Math.round(node.study_duration / 60)} 分钟
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Inner Proficiency Bar */}
                                {node.is_lighted && (
                                  <div className="mt-2.5 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                                      style={{ width: `${node.proficiency}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </>
        )}

      </div>
    </UserLayout>
  );
}
