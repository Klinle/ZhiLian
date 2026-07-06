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
  LogOut,
  Loader2,
} from "lucide-react";
import { profileApi } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);
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

  const fetchProfileData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, radarData] = await Promise.all([
        profileApi.getStats(),
        profileApi.getRadar(),
      ]);
      setStats(statsData);
      setRadar(radarData);
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
          radius: "68%",
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
    <div className="flex h-screen bg-[#fafafa] dark:bg-[#0c0f1d] text-slate-800 dark:text-slate-100 font-sans">

      {/* Sidebar */}
      <aside className="w-72 bg-[#f9f9f9] dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col shrink-0">

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

        <div className="p-4">
          <Link
            href="/chat"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <MessageSquare className="h-4 w-4 text-gray-500" />
            开始新聊天
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          <div className="px-1 py-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">系统功能</p>
          </div>

          <Link href="/knowledge" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer">
            <BookOpen className="h-4 w-4" />
            知识库
          </Link>
          <Link href="/memories" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer">
            <Brain className="h-4 w-4" />
            记忆
          </Link>
          <Link href="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer w-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 font-semibold">
            <Activity className="h-4 w-4 text-indigo-500" />
            学习画像
          </Link>
          <Link href="/graph" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer">
            <Network className="h-4 w-4 text-purple-500" />
            知识图谱
          </Link>
          <Link href="/practice" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer">
            <Award className="h-4 w-4 text-emerald-500" />
            在线练习
          </Link>
          <Link href="/chat" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer">
            <Grid3X3 className="h-4 w-4" />
            首页
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 text-xs bg-gray-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">U</div>
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
      <main className="flex-1 overflow-y-auto p-8 bg-white dark:bg-[#0c0f1d] flex flex-col gap-6">
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
                  三方向学习详情
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
          </>
        )}

      </main>
    </div>
  );
}
