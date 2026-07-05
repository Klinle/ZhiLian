"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export default function KnowledgeGraph() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const data = [
    { name: "知识脑图", x: 0, y: 0, symbolSize: 32, itemStyle: { color: "#6366f1" } },
    
    // 二级分类
    { name: "财报分析", symbolSize: 22, itemStyle: { color: "#a855f7" } },
    { name: "人工智能", symbolSize: 22, itemStyle: { color: "#3b82f6" } },
    { name: "开发日志", symbolSize: 22, itemStyle: { color: "#10b981" } },
    
    // 三级文档实体
    { name: "2026年Q2财报.pdf", symbolSize: 12, itemStyle: { color: "#c084fc" } },
    { name: "资产负债表.xlsx", symbolSize: 12, itemStyle: { color: "#c084fc" } },
    { name: "机器学习讲义.docx", symbolSize: 12, itemStyle: { color: "#60a5fa" } },
    { name: "神经网络入门.pdf", symbolSize: 12, itemStyle: { color: "#60a5fa" } },
    { name: "项目开发备忘录.txt", symbolSize: 12, itemStyle: { color: "#34d399" } },
    { name: "日常会议记要.docx", symbolSize: 12, itemStyle: { color: "#34d399" } },
  ];

  const links = [
    { source: "知识脑图", target: "财报分析" },
    { source: "知识脑图", target: "人工智能" },
    { source: "知识脑图", target: "开发日志" },
    
    { source: "财报分析", target: "2026年Q2财报.pdf" },
    { source: "财报分析", target: "资产负债表.xlsx" },
    
    { source: "人工智能", target: "机器学习讲义.docx" },
    { source: "人工智能", target: "神经网络入门.pdf" },
    
    { source: "开发日志", target: "项目开发备忘录.txt" },
    { source: "开发日志", target: "日常会议记要.docx" },
  ];

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "rgba(18, 20, 36, 0.9)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11 }
    },
    series: [
      {
        type: "graph",
        layout: "force",
        data: data,
        links: links,
        roam: true,
        label: {
          show: true,
          position: "bottom",
          color: "#94a3b8",
          fontSize: 9,
          fontFamily: "sans-serif"
        },
        force: {
          repulsion: 150,
          edgeLength: 60,
          gravity: 0.1
        },
        lineStyle: {
          color: "rgba(99, 102, 241, 0.25)",
          width: 1.5,
          curveness: 0.1
        },
        emphasis: {
          focus: "adjacency",
          lineStyle: {
            width: 3,
            color: "#6366f1"
          }
        }
      }
    ]
  };

  if (!mounted) {
    return <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">图谱构建中...</div>;
  }

  return <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />;
}
