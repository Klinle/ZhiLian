"use client";

import React from "react";
import { Lock, Check } from "lucide-react";
import type { KnowledgeNode } from "@/types";

export const CATEGORY_COLORS: Record<string, string> = {
  programming: "#3b82f6",  // 蓝色
  dsa: "#ef4444",          // 红色
  organization: "#10b981", // 绿色
  os: "#06b6d4",           // 青色
  network: "#8b5cf6",      // 紫色
  database: "#f59e0b",     // 橙色
};

interface SkillNodeProps {
  node: KnowledgeNode;
  isUnlocked: boolean;
  onClick: (node: KnowledgeNode) => void;
}

export default function SkillNode({ node, isUnlocked, onClick }: SkillNodeProps) {
  const color = CATEGORY_COLORS[node.category] || "#6366f1";
  
  // 状态决定
  const isLighted = node.is_lighted;
  
  // 点击逻辑
  const handleNodeClick = () => {
    if (isUnlocked || isLighted) {
      onClick(node);
    }
  };

  return (
    <div
      onClick={handleNodeClick}
      className={`relative w-20 h-[92px] shrink-0 transition-all duration-300 ${
        isUnlocked || isLighted
          ? "cursor-pointer hover:scale-108 active:scale-95"
          : "cursor-not-allowed opacity-60"
      }`}
      title={node.name}
    >
      <svg
        width="80"
        height="92"
        viewBox="0 0 80 92"
        className="overflow-visible select-none drop-shadow-sm hover:drop-shadow-md transition-all"
      >
        <polygon
          points="40,0 80,23 80,69 40,92 0,69 0,23"
          fill={
            isLighted
              ? color
              : "var(--color-card, #ffffff)"
          }
          stroke={isLighted ? "none" : isUnlocked ? color : "#d1d5db"}
          strokeWidth={isLighted ? 0 : 3}
          className={`${
            !isLighted && isUnlocked
              ? "animate-pulse"
              : ""
          } transition-all duration-300`}
          style={{
            filter: isLighted ? `drop-shadow(0 0 6px ${color}80)` : "none",
          }}
        />

        {/* 内部图标或文字 */}
        <foreignObject x="4" y="16" width="72" height="60">
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-1 text-zinc-800 dark:text-zinc-200">
            {isLighted ? (
              // 已点亮：显示勾图标和文字
              <div className="flex flex-col items-center justify-center text-white">
                <Check className="h-4.5 w-4.5 mb-0.5 stroke-[3px]" />
                <span className="text-[9px] font-extrabold truncate max-w-[64px] leading-tight select-none">
                  {node.name}
                </span>
              </div>
            ) : isUnlocked ? (
              // 可解锁：显示彩色文字，熟练度
              <div className="flex flex-col items-center justify-center" style={{ color }}>
                <span className="text-[10px] font-bold truncate max-w-[64px] leading-tight select-none">
                  {node.name}
                </span>
                {node.proficiency > 0 && (
                  <span className="text-[8px] opacity-80 mt-0.5 font-bold">
                    {Math.round(node.proficiency)}%
                  </span>
                )}
              </div>
            ) : (
              // 锁定状态：显示锁图标
              <div className="flex flex-col items-center justify-center text-gray-400 dark:text-zinc-600">
                <Lock className="h-4 w-4 mb-0.5" />
                <span className="text-[9px] font-medium truncate max-w-[64px] leading-tight select-none">
                  {node.name}
                </span>
              </div>
            )}
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}
