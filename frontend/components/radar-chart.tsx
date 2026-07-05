"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export default function RadarChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(18, 20, 36, 0.9)",
      borderWidth: 1,
      borderColor: "rgba(99, 102, 241, 0.3)",
      textStyle: { color: "#fff", fontSize: 11 }
    },
    radar: {
      indicator: [
        { name: "RAG召回精度", max: 100 },
        { name: "记忆留存率", max: 100 },
        { name: "文档解析度", max: 100 },
        { name: "多模态深度", max: 100 },
        { name: "推理响应力", max: 100 },
        { name: "知识覆盖面", max: 100 }
      ],
      shape: "polygon",
      radius: "68%",
      axisName: {
        color: "#94a3b8",
        fontSize: 10,
        fontWeight: "bold",
        fontFamily: "sans-serif"
      },
      splitArea: {
        areaStyle: {
          color: [
            "rgba(99, 102, 241, 0.01)",
            "rgba(99, 102, 241, 0.03)",
            "rgba(99, 102, 241, 0.05)",
            "rgba(99, 102, 241, 0.08)",
            "rgba(99, 102, 241, 0.12)"
          ],
          shadowColor: "rgba(0, 0, 0, 0.2)",
          shadowBlur: 10
        }
      },
      axisLine: {
        lineStyle: {
          color: "rgba(99, 102, 241, 0.15)"
        }
      },
      splitLine: {
        lineStyle: {
          color: "rgba(99, 102, 241, 0.12)"
        }
      }
    },
    series: [
      {
        name: "用户当前能力画像",
        type: "radar",
        data: [
          {
            value: [88, 92, 75, 80, 95, 84],
            name: "能力评分 (分)",
            symbol: "circle",
            symbolSize: 4,
            itemStyle: {
              color: "#818cf8"
            },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(129, 140, 248, 0.6)" },
                  { offset: 1, color: "rgba(99, 102, 241, 0.1)" }
                ]
              }
            },
            lineStyle: {
              width: 2,
              color: "#818cf8"
            }
          }
        ]
      }
    ]
  };

  if (!mounted) {
    return <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">雷达图构建中...</div>;
  }

  return <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />;
}
