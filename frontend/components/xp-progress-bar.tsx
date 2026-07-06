"use client";

import React from "react";
import { Award, Flame, Zap, CheckCircle2 } from "lucide-react";
import type { ProfileStats } from "@/types";

interface XpProgressBarProps {
  stats: ProfileStats;
  nickname: string;
}

const LEVEL_TITLES = [
  "初入江湖", "代码学徒", "逻辑探索者", "算法冒险家",
  "系统架构师", "全栈勇士", "代码探索者", "技术宗师",
  "计算机大师", "图灵传人"
];

export default function XpProgressBar({ stats, nickname }: XpProgressBarProps) {
  const lighted = stats.lighted_nodes || 0;
  const total = stats.total_nodes || 34;
  
  // 等级计算：每掌握5个节点升一级
  const level = Math.floor(lighted / 5) + 1;
  const clampedLevel = Math.min(Math.max(level, 1), 10);
  const levelTitle = LEVEL_TITLES[clampedLevel - 1];

  // 经验值进度条计算：5个节点一级
  const xpCurrent = lighted % 5;
  const xpMax = 5;
  const xpPercentage = (xpCurrent / xpMax) * 100;

  // 连续学习天数模拟（由总学习时间推算，或设定合理的基准打卡）
  const studyHours = stats.study_duration_hours || 0;
  const streakDays = Math.max(Math.ceil(studyHours * 1.8), 1);

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-6 flex-wrap md:flex-nowrap">
      {/* 个人身份 & 称号 */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-200 dark:shadow-none">
          {nickname ? nickname[0].toUpperCase() : "U"}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-800 dark:text-zinc-100 text-sm">{nickname}</span>
            <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900">
              Lv.{level} {levelTitle}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 block">
            成就积分: {lighted * 100} XP
          </span>
        </div>
      </div>

      {/* 经验值进度条 */}
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">
          <span className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
            经验值 (点亮节点升级)
          </span>
          <span>{xpCurrent} / {xpMax} Nodes</span>
        </div>
        <div className="w-full h-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-full overflow-hidden border border-indigo-100/50 dark:border-indigo-900/10">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${xpPercentage}%` }}
          />
        </div>
      </div>

      {/* 统计指标 */}
      <div className="flex items-center gap-4 shrink-0">
        {/* 打卡火苗 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/20">
          <Flame className="h-4.5 w-4.5 text-orange-500 shrink-0 animate-bounce" style={{ animationDuration: "3s" }} />
          <div>
            <span className="text-xs font-bold text-orange-700 dark:text-orange-400 block leading-none">
              🔥 {streakDays}天
            </span>
            <span className="text-[9px] text-orange-400 dark:text-orange-500 mt-0.5 block leading-none">
              学习连击
            </span>
          </div>
        </div>

        {/* 知识点点亮进度 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/20">
          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
          <div>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block leading-none">
              {lighted} / {total}
            </span>
            <span className="text-[9px] text-emerald-400 dark:text-emerald-500 mt-0.5 block leading-none">
              已点亮节点
            </span>
          </div>
        </div>

        {/* 实验通关数 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/20">
          <Award className="h-4.5 w-4.5 text-blue-500 shrink-0" />
          <div>
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400 block leading-none">
              {stats.passed_labs || 0}
            </span>
            <span className="text-[9px] text-blue-400 dark:text-blue-500 mt-0.5 block leading-none">
              已通关实验
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
