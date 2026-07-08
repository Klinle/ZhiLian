"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Users, FileText, MessageSquare, Award, Bot, Loader2, Sparkles, Activity, Trophy, TrendingUp, Zap } from "lucide-react";
import ReactECharts from "echarts-for-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface UserTrend {
  date: string;
  new_users: number;
  active_chats: number;
}

interface CategoryStat {
  node_count: number;
  doc_count: number;
  lab_count: number;
}

interface LabTypeStat {
  count: number;
  submissions: number;
  passed: number;
}

interface DashboardStats {
  users: number;
  documents: number;
  conversations: number;
  submissions: number;
  labs: number;
  agents: number;
  user_trends: UserTrend[];
  category_distribution: Record<string, CategoryStat>;
  lab_type_distribution: Record<string, LabTypeStat>;
  agent_activity: Record<string, number>;
}

interface AiEvaluationResult {
  score: number;
  summary: string;
  details: string;
}

interface DatabaseUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
  created_at: string;
}

interface LeaderboardStudent {
  rank: number;
  name: string;
  avatar: string;
  role: string;
  nodesMastered: number;
  totalNodes: number;
  exercisesPassed: number;
  chatCount: number;
  lastActive: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  programming: "编程开发基础",
  dsa: "数据结构与特性",
  organization: "面向对象架构",
  os: "并发与操作系统",
  network: "网络编程服务",
  database: "数据工程持久化",
  other: "其他知识点",
};

const LAB_TYPE_LABELS: Record<string, string> = {
  code: "编程题",
  quiz: "选择题",
  match: "连线题",
  arrange: "排序题",
  fill: "填空题",
};

// 正常学员名字池
const MOCK_NAMES = ["陈晨", "李明", "王芳", "张伟", "刘洋", "赵鑫", "孙悦", "周磊", "吴静", "郑浩"];

// 7天静态趋势 Mock 数据（独立于 API，确保图表有丰富数据）
const STATIC_TREND_DATA: UserTrend[] = [
  { date: "07-02", new_users: 2, active_chats: 95 },
  { date: "07-03", new_users: 3, active_chats: 118 },
  { date: "07-04", new_users: 1, active_chats: 102 },
  { date: "07-05", new_users: 4, active_chats: 135 },
  { date: "07-06", new_users: 3, active_chats: 148 },
  { date: "07-07", new_users: 2, active_chats: 120 },
  { date: "07-08", new_users: 3, active_chats: 143 },
];

// 10 个虚拟用户的静态 Mock 运营数据（进度严格限制在 30% 以下，活跃对话减少）
const VIRTUAL_LEADERBOARD: Omit<LeaderboardStudent, "rank">[] = [
  { name: "陈晨", avatar: "陈晨", role: "学员", nodesMastered: 11, totalNodes: 41, exercisesPassed: 24, chatCount: 42, lastActive: "25分钟前" },
  { name: "李明", avatar: "李明", role: "学员", nodesMastered: 10, totalNodes: 41, exercisesPassed: 20, chatCount: 38, lastActive: "42分钟前" },
  { name: "王芳", avatar: "王芳", role: "学员", nodesMastered: 9, totalNodes: 41, exercisesPassed: 18, chatCount: 35, lastActive: "1小时前" },
  { name: "张伟", avatar: "张伟", role: "学员", nodesMastered: 8, totalNodes: 41, exercisesPassed: 15, chatCount: 30, lastActive: "3小时前" },
  { name: "刘洋", avatar: "刘洋", role: "学员", nodesMastered: 7, totalNodes: 41, exercisesPassed: 12, chatCount: 26, lastActive: "4小时前" },
  { name: "赵鑫", avatar: "赵鑫", role: "学员", nodesMastered: 6, totalNodes: 41, exercisesPassed: 10, chatCount: 22, lastActive: "昨天" },
  { name: "孙悦", avatar: "孙悦", role: "学员", nodesMastered: 5, totalNodes: 41, exercisesPassed: 8, chatCount: 18, lastActive: "昨天" },
  { name: "周磊", avatar: "周磊", role: "学员", nodesMastered: 4, totalNodes: 41, exercisesPassed: 6, chatCount: 12, lastActive: "2天前" },
  { name: "吴静", avatar: "吴静", role: "学员", nodesMastered: 3, totalNodes: 41, exercisesPassed: 4, chatCount: 8, lastActive: "3天前" },
  { name: "郑浩", avatar: "郑浩", role: "学员", nodesMastered: 1, totalNodes: 41, exercisesPassed: 2, chatCount: 3, lastActive: "5天前" },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // AI 智能诊断状态
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<AiEvaluationResult | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const [data, usersData] = await Promise.all([
        adminApi.getStats(),
        adminApi.listUsers()
      ]);

      // 1. 前端 Mock 数据叠加与增强，用于图表效果丰满
      const enrichedStats: DashboardStats = {
        ...data,
        users: Math.max(data.users || 0, 13),
        documents: Math.max(data.documents || 0, 15),
        conversations: Math.max(data.conversations || 0, 892),
        submissions: Math.max(data.submissions || 0, 487),
        labs: Math.max(data.labs || 0, 87),
        agents: Math.max(data.agents || 0, 3),
        // 趋势数据完全使用静态 Mock，保证图表始终丰满
        user_trends: STATIC_TREND_DATA,
        category_distribution: {
          programming: { node_count: 8, doc_count: 2, lab_count: 18 },
          dsa: { node_count: 11, doc_count: 1, lab_count: 22 },
          organization: { node_count: 8, doc_count: 1, lab_count: 16 },
          os: { node_count: 4, doc_count: 1, lab_count: 10 },
          network: { node_count: 5, doc_count: 1, lab_count: 12 },
          database: { node_count: 5, doc_count: 1, lab_count: 9 },
          ...data.category_distribution
        },
        lab_type_distribution: {
          code: { count: 22, submissions: 154, passed: 112 },
          quiz: { count: 19, submissions: 120, passed: 98 },
          match: { count: 19, submissions: 98, passed: 85 },
          arrange: { count: 14, submissions: 75, passed: 60 },
          fill: { count: 13, submissions: 40, passed: 32 },
          ...data.lab_type_distribution
        }
      };

      setStats(enrichedStats);

      // 2. 生成真实用户的排行榜数据行（根据不同演示账户特定定制各项指标）
      const realStudents = (usersData || []).map((u: DatabaseUser, idx: number) => {
        if (u.username === "student_full") {
          return {
            name: "全栈通关大师 (Full-stack Master)",
            avatar: "通关",
            role: "学员",
            nodesMastered: 41,
            totalNodes: 41,
            exercisesPassed: 87,
            chatCount: 186,
            lastActive: "12分钟前",
          };
        } else if (u.username === "student_half") {
          return {
            name: "半程探索者 (Half-way Scholar)",
            avatar: "半程",
            role: "学员",
            nodesMastered: 20,
            totalNodes: 41,
            exercisesPassed: 45,
            chatCount: 98,
            lastActive: "15分钟前",
          };
        } else if (u.username === "Kleinle" || u.role === "admin") {
          return {
            name: u.nickname || u.username,
            avatar: (u.nickname || u.username).substring(0, 2),
            role: "管理员",
            nodesMastered: 0,
            totalNodes: 41,
            exercisesPassed: 0,
            chatCount: 123,
            lastActive: "18分钟前",
          };
        } else {
          // 其他注册学员的进度严格限制在 30% 以下 (小于 12 个节点)
          const mockName = MOCK_NAMES[idx] || `学员${idx + 1}`;
          const mockedNodes = (idx % 6) + 3; // 3 ~ 8 之间
          return {
            name: u.nickname || mockName,
            avatar: (u.nickname || mockName).substring(0, 2),
            role: "学员",
            nodesMastered: mockedNodes,
            totalNodes: 41,
            exercisesPassed: mockedNodes * 2 + 1,
            chatCount: mockedNodes * 3 + 4,
            lastActive: `${(idx % 4) + 2}小时前`,
          };
        }
      });

      // 3. 将真实用户数据行与虚拟用户数据行融合
      const combined = [...realStudents, ...VIRTUAL_LEADERBOARD];

      // 4. 按通关练习数从高到低排序，重新设定排名
      combined.sort((a, b) => b.exercisesPassed - a.exercisesPassed);
      const finalLeaderboard = combined.map((student, index) => ({
        rank: index + 1,
        ...student,
      }));

      setLeaderboard(finalLeaderboard);

    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchStats();
  }, [fetchStats]);

  const handleStartAiEvaluation = async () => {
    setEvalLoading(true);
    try {
      const data = await adminApi.getAiEvaluation();
      setEvalResult(data);
    } catch (error) {
      console.error("Failed to run AI evaluation:", error);
      alert("AI 运营诊断启动失败，请稍后重试");
    } finally {
      setEvalLoading(false);
    }
  };

  const cards = [
    { label: "注册用户", value: stats?.users ?? 0, icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20", glow: "shadow-indigo-500/10" },
    { label: "文档总数", value: stats?.documents ?? 0, icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", glow: "shadow-emerald-500/10" },
    { label: "对话总数", value: stats?.conversations ?? 0, icon: MessageSquare, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", glow: "shadow-amber-500/10" },
    { label: "实验提交", value: stats?.submissions ?? 0, icon: Award, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", glow: "shadow-purple-500/10" },
    { label: "题目总量", value: stats?.labs ?? 0, icon: TrendingUp, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", glow: "shadow-rose-500/10" },
    { label: "AI 导师", value: stats?.agents ?? 0, icon: Bot, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", glow: "shadow-cyan-500/10" },
  ];

  // 折线图配置（使用静态 Mock 趋势数据）
  const getTrendOption = () => {
    const trends = STATIC_TREND_DATA;
    const dates = trends.map((t: UserTrend) => t.date);
    const newUsers = trends.map((t: UserTrend) => t.new_users);
    const activeChats = trends.map((t: UserTrend) => t.active_chats);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
      },
      legend: {
        data: ["新增用户", "活跃对话"],
        textStyle: { color: "#64748b", fontSize: 10 },
        bottom: 0,
      },
      grid: { left: "3%", right: "4%", top: "10%", bottom: "15%", containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLabel: { color: "#475569", fontSize: 10 },
        axisLine: { lineStyle: { color: "#1e293b" } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#475569", fontSize: 10 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#1f2937", type: "dashed" } },
      },
      series: [
        {
          name: "新增用户",
          type: "line",
          smooth: true,
          data: newUsers,
          itemStyle: { color: "#818cf8" },
          lineStyle: { width: 2, color: "#6366f1" },
          symbol: "circle",
          symbolSize: 5,
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(99,102,241,0.3)" },
                { offset: 1, color: "rgba(99,102,241,0)" },
              ],
            },
          },
        },
        {
          name: "活跃对话",
          type: "line",
          smooth: true,
          data: activeChats,
          itemStyle: { color: "#fbbf24" },
          lineStyle: { width: 2, color: "#f59e0b" },
          symbol: "circle",
          symbolSize: 5,
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(245,158,11,0.25)" },
                { offset: 1, color: "rgba(245,158,11,0)" },
              ],
            },
          },
        },
      ],
    };
  };

  // 饼图配置
  const getCategoryOption = () => {
    const dist = stats?.category_distribution || {};
    const data = Object.entries(dist).map(([cat, val]: [string, CategoryStat]) => ({
      name: CATEGORY_LABELS[cat] || cat,
      value: val.node_count || 0,
    }));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
      },
      legend: { show: false },
      series: [
        {
          name: "分类覆盖",
          type: "pie",
          radius: ["42%", "72%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "transparent", borderWidth: 2 },
          label: {
            show: true,
            color: "#64748b",
            fontSize: 9,
            formatter: "{b}: {c}",
          },
          data: data,
        },
      ],
    };
  };

  // 题型堆叠柱状图
  const getLabOption = () => {
    const dist = stats?.lab_type_distribution || {};
    const types = Object.keys(dist);
    const countData = types.map((t) => dist[t].count || 0);
    const passedData = types.map((t) => dist[t].passed || 0);
    const labels = types.map((t) => LAB_TYPE_LABELS[t] || t);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0", fontSize: 11 },
      },
      legend: {
        data: ["总题数", "通过次数"],
        textStyle: { color: "#64748b", fontSize: 10 },
        bottom: 0,
      },
      grid: { left: "3%", right: "4%", top: "10%", bottom: "15%", containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: "#475569", fontSize: 10 },
        splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#64748b", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          name: "总题数",
          type: "bar",
          data: countData,
          itemStyle: { color: "#3b82f6", borderRadius: [0, 4, 4, 0] },
          barWidth: 10,
        },
        {
          name: "通过次数",
          type: "bar",
          data: passedData,
          itemStyle: { color: "#10b981", borderRadius: [0, 4, 4, 0] },
          barWidth: 10,
        },
      ],
    };
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* 顶部页眉 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">运营控制台</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">系统运营数据概览 · 可视化分析 · AI 智能决策中心</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              实时数据流
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <>
            {/* ── AI 智能诊断评估板（置顶核心功能）── */}
            <div className="relative bg-white dark:bg-[#121424] border border-indigo-200 dark:border-indigo-500/25 rounded-2xl p-5 shadow-md overflow-hidden">
              {/* 科技感背景光晕装饰 */}
              <div className="absolute top-0 right-0 w-64 h-32 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-24 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/15 rounded-lg border border-indigo-500/20">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI 智能运营诊断</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">深度扫描学员活跃率 · 知识覆盖度 · RAG 导师交互质量</p>
                    </div>
                  </div>
                  {evalLoading && (
                    <span className="text-[10px] text-indigo-400 flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full font-medium">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      云端诊断中...
                    </span>
                  )}
                  {evalResult && !evalLoading && (
                    <button
                      onClick={handleStartAiEvaluation}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold transition-all"
                    >
                      重新诊断
                    </button>
                  )}
                </div>

                {!evalResult && !evalLoading && (
                  <div className="flex items-center justify-between gap-6 py-2">
                    <div className="flex-1 text-[11px] text-slate-500 leading-relaxed">
                      AI 将对本平台的学员学习活跃率、各知识类别节点掌握饱满度、以及 RAG 导师的对话质量进行综合评估，生成详细运营改进建议与系统健康评分。
                    </div>
                    <button
                      onClick={handleStartAiEvaluation}
                      className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      开启 AI 智能诊断
                    </button>
                  </div>
                )}

                {evalLoading && (
                  <div className="flex flex-col items-center justify-center text-center py-8 space-y-3">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                    <p className="text-[10px] text-slate-500">正在调遣大模型，综合评估导师偏好与内容死角...</p>
                  </div>
                )}

                {evalResult && !evalLoading && (
                  <div className="space-y-3 mt-1">
                    <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-4 rounded-xl">
                      <div className="relative w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 shrink-0">
                        <span className="text-xl font-bold font-mono text-white">{evalResult.score}</span>
                        <span className="absolute -top-1.5 -right-1 text-[8px] bg-amber-400 text-slate-900 px-1 py-0.5 rounded-full font-bold">分</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">健康度诊断结论</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{evalResult.summary}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 p-4 rounded-xl markdown-body space-y-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {evalResult.details}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 统计指标卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className={`relative bg-white dark:bg-[#121424] border ${card.border} rounded-xl p-4 flex flex-col gap-3 transition-all hover:scale-[1.02] hover:shadow-lg ${card.glow} overflow-hidden group`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-transparent group-hover:from-white/1 transition-all" />
                    <div className={`w-9 h-9 rounded-lg ${card.bg} border ${card.border} flex items-center justify-center`}>
                      <Icon className={`h-4.5 w-4.5 ${card.color}`} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{card.value.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{card.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 可视化第一排（趋势与大类占比） */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 趋势折线图 */}
              <div className="lg:col-span-2 bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-indigo-400" />
                  近 7 天用户与交互活跃趋势
                </h3>
                <div className="h-60">
                  {mounted && <ReactECharts option={getTrendOption()} style={{ height: "100%", width: "100%" }} />}
                </div>
              </div>

              {/* 知识体系分类覆盖统计 */}
              <div className="lg:col-span-1 bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-300 mb-4 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  知识体系分类覆盖统计
                </h3>
                <div className="h-60 flex items-center justify-center">
                  {mounted && <ReactECharts option={getCategoryOption()} style={{ height: "100%", width: "100%" }} />}
                </div>
              </div>
            </div>

            {/* 可视化第二排（学员排行榜与题型通过率） */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 学员排行榜 */}
              <div className="lg:col-span-2 bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-300 mb-4 flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-amber-400" />
                  学员学习进度排行榜
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium">
                        <th className="py-2.5 pl-2 w-12 text-center">排名</th>
                        <th className="py-2.5">学员</th>
                        <th className="py-2.5">角色</th>
                        <th className="py-2.5">知识掌握度</th>
                        <th className="py-2.5 text-center">通关习题</th>
                        <th className="py-2.5 text-center">活跃对话</th>
                        <th className="py-2.5 pr-2 text-right">上次活跃</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((student) => {
                        const progress = Math.round((student.nodesMastered / student.totalNodes) * 100);
                        const isTop = student.rank <= 3;
                        return (
                          <tr key={student.rank} className="border-b border-slate-100/60 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-all">
                            <td className="py-3 text-center">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full font-bold font-mono text-[10px] ${
                                student.rank === 1 ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-300/50 dark:border-amber-500/30" :
                                student.rank === 2 ? "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300" :
                                student.rank === 3 ? "bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400" :
                                "text-slate-400 dark:text-slate-600"
                              }`}>
                                {student.rank}
                              </span>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                  isTop ? "bg-indigo-50 dark:bg-gradient-to-br dark:from-indigo-600/30 dark:to-purple-600/30 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20" : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                                }`}>
                                  {student.avatar.substring(0, 1)}
                                </div>
                                <span className={`font-semibold ${isTop ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>{student.name}</span>
                              </div>
                            </td>
                            <td className="py-3">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                student.role === "管理员" ? "bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500"
                              }`}>
                                {student.role}
                              </span>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-100 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-1.5 rounded-full ${progress >= 90 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : progress >= 50 ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-slate-300 dark:bg-slate-600"}`}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{student.nodesMastered}/{student.totalNodes} ({progress}%)</span>
                              </div>
                            </td>
                            <td className="py-3 text-center font-semibold text-slate-700 dark:text-slate-300 font-mono">{student.exercisesPassed}</td>
                            <td className="py-3 text-center text-slate-500 dark:text-slate-400 font-mono">{student.chatCount}</td>
                            <td className="py-3 pr-2 text-right text-slate-400 dark:text-slate-500">{student.lastActive}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 各类练习题型及通过数据 */}
              <div className="lg:col-span-1 bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-300 mb-4 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-rose-400" />
                  各类练习题型及通过数据
                </h3>
                <div className="h-60">
                  {mounted && <ReactECharts option={getLabOption()} style={{ height: "100%", width: "100%" }} />}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
