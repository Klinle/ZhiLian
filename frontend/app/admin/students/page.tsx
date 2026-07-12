"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, GraduationCap, MessageSquare, Users, TrendingUp, Award } from "lucide-react";

interface MockStudent {
  name: string;
  avatar: string;
  role: string;
  nodesMastered: number;
  totalNodes: number;
  exercisesPassed: number;
  chatCount: number;
  lastActive: string;
  joinDate: string;
  weakCategories: string[];
}

const VIRTUAL_STUDENTS: MockStudent[] = [
  { name: "陈晨", avatar: "陈晨", role: "学员", nodesMastered: 11, totalNodes: 41, exercisesPassed: 24, chatCount: 42, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["并发与操作系统", "网络编程服务"] },
  { name: "李明", avatar: "李明", role: "学员", nodesMastered: 10, totalNodes: 41, exercisesPassed: 20, chatCount: 38, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["数据工程持久化"] },
  { name: "王芳", avatar: "王芳", role: "学员", nodesMastered: 9, totalNodes: 41, exercisesPassed: 18, chatCount: 35, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["面向对象架构", "并发与操作系统"] },
  { name: "张伟", avatar: "张伟", role: "学员", nodesMastered: 8, totalNodes: 41, exercisesPassed: 15, chatCount: 30, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["数据结构与特性"] },
  { name: "刘洋", avatar: "刘洋", role: "学员", nodesMastered: 7, totalNodes: 41, exercisesPassed: 12, chatCount: 26, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["编程开发基础", "数据结构与特性"] },
  { name: "赵鑫", avatar: "赵鑫", role: "学员", nodesMastered: 6, totalNodes: 41, exercisesPassed: 10, chatCount: 22, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["网络编程服务", "数据工程持久化"] },
  { name: "孙悦", avatar: "孙悦", role: "学员", nodesMastered: 5, totalNodes: 41, exercisesPassed: 8, chatCount: 18, lastActive: "昨天", joinDate: "2026-07-05", weakCategories: ["面向对象架构"] },
  { name: "周磊", avatar: "周磊", role: "学员", nodesMastered: 4, totalNodes: 41, exercisesPassed: 6, chatCount: 12, lastActive: "2天前", joinDate: "2026-07-05", weakCategories: ["并发与操作系统", "网络编程服务", "数据工程持久化"] },
  { name: "吴静", avatar: "吴静", role: "学员", nodesMastered: 3, totalNodes: 41, exercisesPassed: 4, chatCount: 8, lastActive: "3天前", joinDate: "2026-07-05", weakCategories: ["编程开发基础", "数据结构与特性", "面向对象架构"] },
  { name: "郑浩", avatar: "郑浩", role: "学员", nodesMastered: 1, totalNodes: 41, exercisesPassed: 2, chatCount: 3, lastActive: "5天前", joinDate: "2026-07-05", weakCategories: ["编程开发基础", "数据结构与特性", "并发与操作系统", "网络编程服务", "数据工程持久化"] },
];

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<MockStudent[]>([]);
  const [loading, setLoading] = useState(true);
  interface StudentProfile {
    username: string;
    nickname?: string;
    stats?: {
      lighted_nodes?: number;
      total_nodes?: number;
      pass_rate?: number;
      study_duration_hours?: number;
      memory_count?: number;
    };
    radar?: {
      values: { direction: string; lighted: number; total: number; coverage: number }[];
    };
  }

  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  const fetchStudents = useCallback(async () => {
    try {
      const apiStudents = await adminApi.listStudents();

      // 合并 API 真实用户 + 虚拟 Mock 数据
      const merged: MockStudent[] = [];

      // 先处理 API 返回的真实用户
      for (const apiUser of apiStudents || []) {
        if (apiUser.username === "student_full") {
          merged.push({
            name: "全栈通关大师",
            avatar: "通关",
            role: "学员",
            nodesMastered: 41,
            totalNodes: 41,
            exercisesPassed: 87,
            chatCount: 186,
            lastActive: "12分钟前",
            joinDate: "2026-07-05",
            weakCategories: [],
          });
        } else if (apiUser.username === "student_half") {
          merged.push({
            name: "半程探索者",
            avatar: "半程",
            role: "学员",
            nodesMastered: 20,
            totalNodes: 41,
            exercisesPassed: 45,
            chatCount: 98,
            lastActive: "15分钟前",
            joinDate: "2026-07-05",
            weakCategories: ["并发与操作系统", "网络编程服务"],
          });
        } else if (apiUser.role === "admin") {
          merged.push({
            name: apiUser.nickname || apiUser.username,
            avatar: (apiUser.nickname || apiUser.username).substring(0, 2),
            role: "管理员",
            nodesMastered: 0,
            totalNodes: 41,
            exercisesPassed: 0,
            chatCount: 123,
            lastActive: "18分钟前",
            joinDate: "2026-07-05",
            weakCategories: [],
          });
        } else {
          // 其他真实注册学员
          merged.push({
            name: apiUser.nickname || apiUser.username,
            avatar: (apiUser.nickname || apiUser.username).substring(0, 2),
            role: "学员",
            nodesMastered: Math.min(apiUser.lighted_nodes || 0, 41),
            totalNodes: 41,
            exercisesPassed: apiUser.passed_labs || 0,
            chatCount: apiUser.total_submissions ? Math.round(apiUser.total_submissions * 0.6) : 0,
            lastActive: "1小时前",
            joinDate: "2026-07-05",
            weakCategories: [],
          });
        }
      }

      // 合并虚拟学员（去重：按 name 去重）
      const existingNames = new Set(merged.map((m) => m.name));
      for (const vs of VIRTUAL_STUDENTS) {
        if (!existingNames.has(vs.name)) {
          merged.push(vs);
        }
      }

      // 按通关习题数降序排列
      merged.sort((a, b) => b.exercisesPassed - a.exercisesPassed);
      setStudents(merged);
    } catch (error) {
      console.error("Failed to fetch students:", error);
      // 网络失败时直接使用纯 Mock 数据
      const demoAccounts: MockStudent[] = [
        { name: "全栈通关大师", avatar: "通关", role: "学员", nodesMastered: 41, totalNodes: 41, exercisesPassed: 87, chatCount: 186, lastActive: "12分钟前", joinDate: "2026-07-05", weakCategories: [] },
        { name: "半程探索者", avatar: "半程", role: "学员", nodesMastered: 20, totalNodes: 41, exercisesPassed: 45, chatCount: 98, lastActive: "15分钟前", joinDate: "2026-07-05", weakCategories: ["并发与操作系统", "网络编程服务"] },
        { name: "Kleinle", avatar: "Kl", role: "管理员", nodesMastered: 0, totalNodes: 41, exercisesPassed: 0, chatCount: 123, lastActive: "18分钟前", joinDate: "2026-07-05", weakCategories: [] },
        ...VIRTUAL_STUDENTS,
      ];
      demoAccounts.sort((a, b) => b.exercisesPassed - a.exercisesPassed);
      setStudents(demoAccounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleViewProfile = async (studentName: string) => {
    // 尝试通过 admin API 获取学员详细画像
    try {
      const apiStudents = await adminApi.listStudents();
      const matched = (apiStudents || []).find(
        (s: { username: string; nickname?: string }) =>
          s.username === studentName || s.nickname === studentName
      );
      if (matched) {
        const data = await adminApi.getStudentProfile(matched.id);
        setSelectedStudent(data);
      } else {
        // Mock 学员直接显示内联卡片数据
        const found = students.find((s) => s.name === studentName);
        setSelectedStudent({ username: found?.name || studentName, nickname: found?.name, stats: found ? { lighted_nodes: found.nodesMastered, total_nodes: found.totalNodes } : undefined, radar: undefined });
      }
    } catch {
      // 降级：使用本地 Mock 数据
      const found = students.find((s) => s.name === studentName);
      setSelectedStudent({ username: found?.name || studentName, nickname: found?.name, stats: undefined, radar: undefined });
    }
  };

  // 统计摘要
  const totalStudents = students.filter((s) => s.role !== "管理员").length;
  const avgMastery = totalStudents > 0
    ? Math.round(students.filter((s) => s.role !== "管理员").reduce((sum, s) => sum + s.nodesMastered, 0) / totalStudents)
    : 0;
  const totalPassed = students.reduce((sum, s) => sum + s.exercisesPassed, 0);
  const avgChatCount = totalStudents > 0
    ? Math.round(students.filter((s) => s.role !== "管理员").reduce((sum, s) => sum + s.chatCount, 0) / totalStudents)
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* 页眉 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">学员概览</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">查看全部学员的学习进度、知识掌握度与活跃状态</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full font-mono font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              {students.length} 名成员
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <>
            {/* 统计摘要卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "学员总数", value: totalStudents, icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
                { label: "平均掌握节点", value: `${avgMastery}/41`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                { label: "累计通关习题", value: totalPassed, icon: Award, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
                { label: "平均对话次数", value: avgChatCount, icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`bg-white dark:bg-[#121424] border ${item.border} rounded-xl p-4 flex items-center gap-3`}>
                    <div className={`w-10 h-10 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <div>
                      <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">{item.value}</div>
                      <div className="text-[10px] text-slate-500">{item.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 学员卡片网格 */}
            {students.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm">暂无学员</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {students.map((s, idx) => {
                  const progress = Math.round((s.nodesMastered / s.totalNodes) * 100);
                  const isTop = idx < 3;
                  const isInactive = s.lastActive.includes("天前");
                  const isWarning = s.lastActive.includes("天前") && parseInt(s.lastActive) >= 5;

                  return (
                    <div
                      key={`${s.name}-${idx}`}
                      onClick={() => handleViewProfile(s.name)}
                      className="relative bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-5 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-500/20 transition-all group cursor-pointer"
                    >
                      {/* 排名角标（前3） */}
                      {isTop && (
                        <div className="absolute -top-2 -right-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md ${
                            idx === 0 ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" :
                            idx === 1 ? "bg-gradient-to-br from-slate-400 to-slate-500 text-white" :
                            "bg-gradient-to-br from-orange-400 to-amber-500 text-white"
                          }`}>
                            {idx + 1}
                          </div>
                        </div>
                      )}

                      {/* 头像 + 基本信息 */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold ${
                          s.role === "管理员"
                            ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                            : isTop
                            ? "bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-600 dark:text-indigo-300 border-2 border-indigo-300 dark:border-indigo-500/30"
                            : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                        }`}>
                          {s.avatar.substring(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{s.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              s.role === "管理员"
                                ? "bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                                : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500"
                            }`}>
                              {s.role}
                            </span>
                            <span className={`flex items-center gap-1 text-[9px] ${
                              isWarning ? "text-rose-500" : isInactive ? "text-amber-500" : "text-emerald-500"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isWarning ? "bg-rose-500" : isInactive ? "bg-amber-500" : "bg-emerald-500"
                              }`} />
                              {s.lastActive}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 知识掌握进度条 */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400">知识掌握度</span>
                          <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">{s.nodesMastered}/{s.totalNodes} ({progress}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              progress >= 90 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                              progress >= 50 ? "bg-gradient-to-r from-indigo-500 to-purple-500" :
                              progress >= 20 ? "bg-gradient-to-r from-amber-500 to-orange-400" :
                              "bg-slate-300 dark:bg-slate-600"
                            }`}
                            style={{ width: `${Math.max(progress, 2)}%` }}
                          />
                        </div>
                      </div>

                      {/* 数据指标 */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold font-mono text-indigo-500">{s.exercisesPassed}</div>
                          <div className="text-[9px] text-slate-400">通关习题</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold font-mono text-emerald-500">{s.chatCount}</div>
                          <div className="text-[9px] text-slate-400">活跃对话</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold font-mono text-amber-500">{s.joinDate.slice(5)}</div>
                          <div className="text-[9px] text-slate-400">加入日期</div>
                        </div>
                      </div>

                      {/* 薄弱类别 */}
                      {s.weakCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.weakCategories.map((cat) => (
                            <span key={cat} className="px-1.5 py-0.5 rounded text-[8px] bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/15">
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                      {s.role === "学员" && s.weakCategories.length === 0 && s.nodesMastered === 41 && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border border-emerald-200/50">
                          全部掌握
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 学员画像弹窗（保持原有逻辑） */}
        {selectedStudent && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedStudent(null)}
          >
            <div
              className="bg-white dark:bg-[#121424] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-slate-200 dark:border-[#1f233a]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#1f233a] sticky top-0 bg-white dark:bg-[#121424] z-10 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                    {selectedStudent.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-slate-900 dark:text-white">{selectedStudent.username}</h2>
                    <p className="text-xs text-slate-400">{selectedStudent.nickname || "无昵称"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm px-3 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  关闭
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-indigo-500">
                      {selectedStudent.stats?.lighted_nodes ?? 0}/{selectedStudent.stats?.total_nodes ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">点亮知识点</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-emerald-500">
                      {selectedStudent.stats?.pass_rate ?? 0}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">实验通过率</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-amber-500">
                      {selectedStudent.stats?.study_duration_hours ?? 0}h
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">学习时长</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-purple-500">
                      {selectedStudent.stats?.memory_count ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">记忆条目</div>
                  </div>
                </div>

                {selectedStudent.radar?.values && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5" />
                      能力维度
                    </h3>
                    <div className="space-y-2">
                      {selectedStudent.radar.values.map((v) => (
                        <div key={v.direction} className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{v.direction}</span>
                            <span className="text-[10px] font-mono text-slate-400">{v.lighted}/{v.total} · {v.coverage}%</span>
                          </div>
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                              style={{ width: `${v.coverage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
