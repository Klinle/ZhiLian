"use client";

import React, { useEffect, useState } from "react";
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
  LogOut
} from "lucide-react";
import RadarChart from "@/components/radar-chart";

// Dynamic import for ECharts
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export default function ProfilePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
      }
    }
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // 最近 7 天学习时间折线图配置
  const studyTrendOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(18, 20, 36, 0.9)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 }
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      top: "10%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: ["6/28", "6/29", "6/30", "7/1", "7/2", "7/3", "7/4"],
      axisLabel: { color: "#94a3b8", fontSize: 10 },
      axisLine: { lineStyle: { color: "rgba(99, 102, 241, 0.15)" } }
    },
    yAxis: {
      type: "value",
      name: "分钟",
      nameTextStyle: { color: "#94a3b8", fontSize: 9 },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
      splitLine: { lineStyle: { color: "rgba(99, 102, 241, 0.08)" } }
    },
    series: [
      {
        name: "学习时长",
        type: "line",
        smooth: true,
        data: [35, 42, 15, 60, 48, 80, 55],
        itemStyle: { color: "#6366f1" },
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(99, 102, 241, 0.25)" },
              { offset: 1, color: "rgba(99, 102, 241, 0)" }
            ]
          }
        }
      }
    ]
  };

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-[#0c0f1d] text-slate-800 dark:text-slate-100 font-sans">
      
      {/* Sidebar 侧边栏 */}
      <aside className="w-72 bg-[#f9f9f9] dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col shrink-0">
        
        {/* Role Switcher Button */}
        <div className="px-4 pt-4 pb-0">
          <Link
            href="/admin"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 hover:bg-indigo-650 hover:text-white transition-all text-xs font-semibold text-indigo-650 dark:text-indigo-400"
          >
            <Shield className="h-4 w-4 shrink-0" />
            切换至管理后台
          </Link>
        </div>

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
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer w-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 font-semibold"
          >
            <Activity className="h-4 w-4 text-indigo-500" />
            学习画像
          </Link>
          <Link
            href="/graph"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
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
            href="/"
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

        {/* Dashboards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Card 1 */}
          <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-2xl font-bold font-mono">12 / 30</span>
              <p className="text-[10px] text-slate-400 mt-0.5">已点亮知识点数</p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <span className="text-2xl font-bold font-mono">85%</span>
              <p className="text-[10px] text-slate-400 mt-0.5">测验平均正确率</p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-2xl font-bold font-mono">42.5 小时</span>
              <p className="text-[10px] text-slate-400 mt-0.5">累计深度阅读时长</p>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] p-5 rounded-2xl flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <span className="text-2xl font-bold font-mono">2.4x</span>
              <p className="text-[10px] text-slate-400 mt-0.5">语义记忆加速召回</p>
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
            <div className="flex-1 min-h-0 relative">
              <RadarChart />
            </div>
          </div>

          {/* Weekly heat line chart */}
          <div className="lg:col-span-3 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-5 h-[340px] flex flex-col">
            <h3 className="text-xs font-bold text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              最近 7 天深度学习时长统计
            </h3>
            <div className="flex-1 min-h-0 relative">
              {mounted ? (
                <ReactECharts option={studyTrendOption} style={{ height: "100%", width: "100%" }} />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">折线图生成中...</div>
              )}
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
