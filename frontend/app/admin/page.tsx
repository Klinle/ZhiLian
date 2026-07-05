"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AdminLayout from "@/components/admin-layout";
import { 
  Users, 
  BookOpen, 
  Cpu, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingUp,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Dynamic import to prevent SSR issues with ECharts
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export default function AdminDashboard() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // 模拟近 7 天请求量折线图配置
  const lineChartOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1e1e2f",
      borderWidth: 0,
      textStyle: { color: "#fff" }
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
      axisLabel: { color: "#94a3b8" },
      axisLine: { lineStyle: { color: "#334155" } }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#94a3b8" },
      splitLine: { lineStyle: { color: "#1e293b" } }
    },
    series: [
      {
        name: "API 请求次数",
        type: "line",
        smooth: true,
        data: [1200, 1850, 1510, 2240, 2800, 1900, 2450],
        itemStyle: { color: "#6366f1" },
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(99, 102, 241, 0.4)" },
              { offset: 1, color: "rgba(99, 102, 241, 0)" }
            ]
          }
        }
      }
    ]
  };

  // 知识库文档占比饼图
  const pieChartOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      formatter: "{a} <br/>{b} : {c} ({d}%)"
    },
    legend: {
      orient: "vertical",
      left: "left",
      textStyle: { color: "#94a3b8" }
    },
    series: [
      {
        name: "文档格式",
        type: "pie",
        radius: "65%",
        center: ["60%", "50%"],
        data: [
          { value: 45, name: "PDF 电子书", itemStyle: { color: "#6366f1" } },
          { value: 25, name: "Word 讲义", itemStyle: { color: "#a855f7" } },
          { value: 15, name: "Excel 表格", itemStyle: { color: "#22c55e" } },
          { value: 10, name: "TXT 随手记", itemStyle: { color: "#eab308" } },
          { value: 5, name: "音视频转文字", itemStyle: { color: "#ef4444" } }
        ],
        roseType: "radius",
        label: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)"
          }
        }
      }
    ]
  };

  const cardsData = [
    {
      title: "总使用人员",
      value: "1,248 人",
      change: "+12% 环比上周",
      isPositive: true,
      icon: Users,
      color: "from-blue-500/10 to-indigo-500/10 text-indigo-500"
    },
    {
      title: "知识库文档数",
      value: "356 篇",
      change: "+34 篇本周新增",
      isPositive: true,
      icon: BookOpen,
      color: "from-purple-500/10 to-pink-500/10 text-purple-500"
    },
    {
      title: "RAG 检索并发数",
      value: "42 QPS",
      change: "-5% 环比昨日",
      isPositive: false,
      icon: Activity,
      color: "from-emerald-500/10 to-teal-500/10 text-emerald-500"
    },
    {
      title: "系统平均响应",
      value: "185 ms",
      change: "-12ms 性能提升",
      isPositive: true,
      icon: Cpu,
      color: "from-amber-500/10 to-orange-500/10 text-amber-500"
    }
  ];

  const recentTasks = [
    { id: "T-1082", file: "2026年Q2财报分析.pdf", size: "4.8 MB", status: "解析中", progress: 65 },
    { id: "T-1081", file: "机器学习基础讲义.docx", size: "12.4 MB", status: "已完成", progress: 100 },
    { id: "T-1080", file: "日常工作汇报.xlsx", size: "854 KB", status: "已完成", progress: 100 },
    { id: "T-1079", file: "技术架构图解.png", size: "2.1 MB", status: "排队中", progress: 0 }
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">系统总览 Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">这里展示了 CogniLink 的系统核心指标与流水线任务状态。</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
              数据授时：实时
            </span>
          </div>
        </div>

        {/* Indicators Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cardsData.map((card, idx) => (
            <Card key={idx} className="border-slate-100 dark:border-[#1f233a] bg-white dark:bg-[#121424] shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs font-medium flex items-center ${
                    card.isPositive ? "text-emerald-500" : "text-rose-500"
                  }`}>
                    {card.isPositive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                    {card.change.split(" ")[0]}
                  </span>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white">{card.value}</span>
                  <p className="text-xs text-slate-400 mt-1">{card.title} ({card.change.split(" ")[1] || ""})</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* API requests over time */}
          <Card className="lg:col-span-2 border-slate-100 dark:border-[#1f233a] bg-white dark:bg-[#121424]">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                系统 API 访问趋势 (近 7 日)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mounted ? (
                <ReactECharts option={lineChartOption} style={{ height: "300px" }} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400">图表加载中...</div>
              )}
            </CardContent>
          </Card>

          {/* Document breakdown */}
          <Card className="border-slate-100 dark:border-[#1f233a] bg-white dark:bg-[#121424]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <FileText className="h-4 w-4 text-purple-500" />
                知识库文档类型占比
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mounted ? (
                <ReactECharts option={pieChartOption} style={{ height: "300px" }} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400">图表加载中...</div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Tasks Section */}
        <Card className="border-slate-100 dark:border-[#1f233a] bg-white dark:bg-[#121424]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">最近数据流水线任务</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                    <th className="py-3 px-6">任务 ID</th>
                    <th className="py-3 px-6">处理文件</th>
                    <th className="py-3 px-6">大小</th>
                    <th className="py-3 px-6">处理进度</th>
                    <th className="py-3 px-6">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {recentTasks.map((task, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 text-slate-600 dark:text-slate-300">
                      <td className="py-4 px-6 font-mono text-indigo-500 font-semibold">{task.id}</td>
                      <td className="py-4 px-6 font-medium text-slate-850 dark:text-white">{task.file}</td>
                      <td className="py-4 px-6 font-mono text-slate-400">{task.size}</td>
                      <td className="py-4 px-6 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                task.progress === 100 ? "bg-emerald-500" : "bg-indigo-500"
                              }`}
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] w-8">{task.progress}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          task.status === "已完成" 
                            ? "bg-emerald-500/10 text-emerald-500" 
                            : task.status === "解析中"
                            ? "bg-indigo-500/10 text-indigo-400 animate-pulse"
                            : "bg-slate-500/10 text-slate-400"
                        }`}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </AdminLayout>
  );
}
