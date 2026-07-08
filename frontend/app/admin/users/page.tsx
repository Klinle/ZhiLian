"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, Shield, Users, Calendar, CheckCircle2, Pencil } from "lucide-react";

// ---- Mock 数据（与 Dashboard 排行榜完全一致）----
interface MockUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
  created_at: string;
  nodesMastered: number;
  totalNodes: number;
  exercisesPassed: number;
  chatCount: number;
  lastActive: string;
}

const MOCK_USERS: MockUser[] = [
  { id: "mock-kleinle", username: "Kleinle", nickname: "Kleinle", role: "admin", created_at: "2025-01-01T08:00:00Z", nodesMastered: 0, totalNodes: 41, exercisesPassed: 0, chatCount: 123, lastActive: "18分钟前" },
  { id: "mock-full", username: "student_full", nickname: "全栈通关大师", role: "student", created_at: "2025-01-15T10:30:00Z", nodesMastered: 41, totalNodes: 41, exercisesPassed: 87, chatCount: 186, lastActive: "12分钟前" },
  { id: "mock-half", username: "student_half", nickname: "半程探索者", role: "student", created_at: "2025-02-10T14:00:00Z", nodesMastered: 20, totalNodes: 41, exercisesPassed: 45, chatCount: 98, lastActive: "15分钟前" },
  { id: "mock-1", username: "chenchen", nickname: "陈晨", role: "student", created_at: "2025-03-12T09:00:00Z", nodesMastered: 11, totalNodes: 41, exercisesPassed: 24, chatCount: 42, lastActive: "25分钟前" },
  { id: "mock-2", username: "liming", nickname: "李明", role: "student", created_at: "2025-03-15T11:00:00Z", nodesMastered: 10, totalNodes: 41, exercisesPassed: 20, chatCount: 38, lastActive: "42分钟前" },
  { id: "mock-3", username: "wangfang", nickname: "王芳", role: "student", created_at: "2025-03-20T14:30:00Z", nodesMastered: 9, totalNodes: 41, exercisesPassed: 18, chatCount: 35, lastActive: "1小时前" },
  { id: "mock-4", username: "zhangwei", nickname: "张伟", role: "student", created_at: "2025-04-01T09:00:00Z", nodesMastered: 8, totalNodes: 41, exercisesPassed: 15, chatCount: 30, lastActive: "3小时前" },
  { id: "mock-5", username: "liuyang", nickname: "刘洋", role: "student", created_at: "2025-04-05T16:00:00Z", nodesMastered: 7, totalNodes: 41, exercisesPassed: 12, chatCount: 26, lastActive: "4小时前" },
  { id: "mock-6", username: "zhaoxin", nickname: "赵鑫", role: "student", created_at: "2025-04-10T10:00:00Z", nodesMastered: 6, totalNodes: 41, exercisesPassed: 10, chatCount: 22, lastActive: "昨天" },
  { id: "mock-7", username: "sunyue", nickname: "孙悦", role: "student", created_at: "2025-04-12T08:00:00Z", nodesMastered: 5, totalNodes: 41, exercisesPassed: 8, chatCount: 18, lastActive: "昨天" },
  { id: "mock-8", username: "zhoulei", nickname: "周磊", role: "student", created_at: "2025-04-18T13:00:00Z", nodesMastered: 4, totalNodes: 41, exercisesPassed: 6, chatCount: 12, lastActive: "2天前" },
  { id: "mock-9", username: "wujing", nickname: "吴静", role: "student", created_at: "2025-04-22T15:00:00Z", nodesMastered: 3, totalNodes: 41, exercisesPassed: 4, chatCount: 8, lastActive: "3天前" },
  { id: "mock-10", username: "zhenghao", nickname: "郑浩", role: "student", created_at: "2025-05-01T10:00:00Z", nodesMastered: 1, totalNodes: 41, exercisesPassed: 2, chatCount: 3, lastActive: "5天前" },
];

function getDaysSince(dateStr: string): number {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function getActivityColor(lastActive: string): string {
  if (lastActive.includes("分钟前") || lastActive.includes("小时前")) return "text-emerald-500 bg-emerald-500";
  if (lastActive === "昨天") return "text-amber-500 bg-amber-500";
  return "text-slate-300 dark:text-slate-600 bg-slate-300 dark:bg-slate-600";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<MockUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const apiUsers = await adminApi.listUsers();

      // 合并 API 用户 + Mock 数据
      const merged: MockUser[] = [];
      const usedUsernames = new Set<string>();

      // 首先处理 API 返回的真实用户
      for (const apiUser of apiUsers || []) {
        usedUsernames.add(apiUser.username);
        // 查找匹配的 mock 数据以补充字段
        const mockMatch = MOCK_USERS.find((m) =>
          m.username.toLowerCase() === apiUser.username.toLowerCase() ||
          (m.role === "admin" && apiUser.role === "admin")
        );

        merged.push({
          id: apiUser.id,
          username: apiUser.username,
          nickname: apiUser.nickname || mockMatch?.nickname || apiUser.username,
          role: apiUser.role || "student",
          created_at: apiUser.created_at || mockMatch?.created_at || "",
          nodesMastered: mockMatch?.nodesMastered ?? 0,
          totalNodes: mockMatch?.totalNodes ?? 41,
          exercisesPassed: mockMatch?.exercisesPassed ?? 0,
          chatCount: mockMatch?.chatCount ?? 0,
          lastActive: mockMatch?.lastActive || "",
        });
      }

      // 补充 API 中没有的 Mock 用户（但不要覆盖已有的真实用户）
      for (const mockUser of MOCK_USERS) {
        if (!usedUsernames.has(mockUser.username)) {
          merged.push(mockUser);
        }
      }

      // 按角色排序：管理员在前，然后学生
      merged.sort((a, b) => {
        if (a.role === "admin") return -1;
        if (b.role === "admin") return 1;
        return b.exercisesPassed - a.exercisesPassed;
      });

      setUsers(merged);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      // 网络失败时使用纯 Mock
      setUsers([...MOCK_USERS].sort((a, b) => {
        if (a.role === "admin") return -1;
        if (b.role === "admin") return 1;
        return b.exercisesPassed - a.exercisesPassed;
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUpdateRole = async (userId: string) => {
    if (userId.startsWith("mock-")) {
      // Mock 用户的角色仅前端变更
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: editRole } : u)));
      setEditingId(null);
      return;
    }
    try {
      await adminApi.updateUser(userId, { role: editRole });
      setEditingId(null);
      await fetchUsers();
    } catch (error) {
      console.error("Failed to update user:", error);
      alert("更新失败");
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;
  const studentCount = users.filter((u) => u.role === "student").length;

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* 页眉 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">用户管理</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">管理系统注册用户、角色权限与活跃状态</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full font-mono font-medium">
              <Shield className="h-3 w-3" />
              {adminCount} 管理员
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono font-medium">
              <Users className="h-3 w-3" />
              {studentCount} 学员
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#1f233a] text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
                    <th className="text-left px-5 py-3.5 font-medium">用户</th>
                    <th className="text-left px-4 py-3.5 font-medium">昵称</th>
                    <th className="text-left px-4 py-3.5 font-medium">角色</th>
                    <th className="text-left px-4 py-3.5 font-medium hidden md:table-cell">注册时间</th>
                    <th className="text-left px-4 py-3.5 font-medium hidden md:table-cell">注册天数</th>
                    <th className="text-left px-4 py-3.5 font-medium hidden lg:table-cell">活跃状态</th>
                    <th className="text-left px-4 py-3.5 font-medium hidden lg:table-cell">学习进度</th>
                    <th className="text-left px-4 py-3.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1f233a]/50">
                  {users.map((user) => {
                    const daysSince = user.created_at ? getDaysSince(user.created_at) : 0;
                    const isActive = user.lastActive.includes("分钟前") || user.lastActive.includes("小时前");
                    const isWarning = user.lastActive.includes("天前");
                    const progress = user.totalNodes ? Math.round((user.nodesMastered / 41) * 100) : Math.round((user.nodesMastered / 41) * 100);

                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors"
                      >
                        {/* 用户头像 + 用户名 */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                              user.role === "admin"
                                ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                                : user.nodesMastered >= 20
                                ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-300/50 dark:border-emerald-500/30"
                                : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                            }`}>
                              {(user.nickname || user.username).substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{user.username}</p>
                              <p className="text-[10px] text-slate-400">ID: {user.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>

                        {/* 昵称 */}
                        <td className="px-4 py-3.5">
                          <span className="text-slate-600 dark:text-slate-300 text-xs">{user.nickname || "-"}</span>
                        </td>

                        {/* 角色 */}
                        <td className="px-4 py-3.5">
                          {editingId === user.id ? (
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="student">学员</option>
                              <option value="teacher">教师</option>
                              <option value="admin">管理员</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              user.role === "admin"
                                ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/20"
                                : user.role === "teacher"
                                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20"
                                : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/30"
                            }`}>
                              {user.role === "admin" ? "管理员" : user.role === "teacher" ? "教师" : "学员"}
                            </span>
                          )}
                        </td>

                        {/* 注册时间 */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span className="text-xs text-slate-500 font-mono">{user.created_at ? new Date(user.created_at).toLocaleDateString("zh-CN") : "-"}</span>
                          </div>
                        </td>

                        {/* 注册天数 */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className={`text-xs font-mono ${
                            daysSince > 365 ? "text-amber-500" :
                            daysSince > 180 ? "text-indigo-500" :
                            "text-slate-500"
                          }`}>
                            {daysSince > 0 ? `${daysSince} 天` : "-"}
                          </span>
                        </td>

                        {/* 活跃状态 */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${getActivityColor(user.lastActive)}`} />
                            <span className={`text-xs ${
                              isActive ? "text-emerald-600 dark:text-emerald-400" :
                              isWarning ? "text-amber-600 dark:text-amber-400" :
                              "text-slate-400"
                            }`}>
                              {user.lastActive || "-"}
                            </span>
                          </div>
                        </td>

                        {/* 学习进度（仅学员展示） */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          {user.role !== "admin" ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-slate-100 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    progress >= 90 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                                    progress >= 50 ? "bg-gradient-to-r from-indigo-500 to-purple-500" :
                                    progress >= 20 ? "bg-gradient-to-r from-amber-500 to-orange-400" :
                                    "bg-slate-300 dark:bg-slate-600"
                                  }`}
                                  style={{ width: `${Math.max(progress, 2)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">{user.nodesMastered}/41</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>

                        {/* 操作 */}
                        <td className="px-4 py-3.5">
                          {editingId === user.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleUpdateRole(user.id)}
                                className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                保存
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-[10px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(user.id);
                                setEditRole(user.role);
                              }}
                              className="flex items-center gap-1 text-[10px] px-3 py-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-medium transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                              编辑
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* 表格底部统计 */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-[#1f233a]/50 bg-slate-50/50 dark:bg-slate-900/20 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">共 {users.length} 名用户</span>
              <span className="text-[10px] text-slate-400">
                活跃 {users.filter((u) => u.lastActive.includes("分钟前") || u.lastActive.includes("小时前")).length} 人 ·
                近期流失风险 {users.filter((u) => u.lastActive.includes("天前") && parseInt(u.lastActive) >= 3).length} 人
              </span>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
