"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Users, FileText, MessageSquare, Award, Bot, Loader2 } from "lucide-react";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const cards = [
    { label: "注册用户", value: stats?.users ?? 0, icon: Users, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "文档总数", value: stats?.documents ?? 0, icon: FileText, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "对话总数", value: stats?.conversations ?? 0, icon: MessageSquare, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "实验提交", value: stats?.submissions ?? 0, icon: Award, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "实验题目", value: stats?.labs ?? 0, icon: Award, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: "Agent 数", value: stats?.agents ?? 0, icon: Bot, color: "text-blue-500", bg: "bg-blue-500/10" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">系统运营数据概览</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4 flex flex-col gap-3"
                >
                  <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                      {card.value}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{card.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
