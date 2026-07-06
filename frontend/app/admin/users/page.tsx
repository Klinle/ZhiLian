"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, Shield } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const data = await adminApi.listUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUpdateRole = async (userId: string) => {
    try {
      await adminApi.updateUser(userId, { role: editRole });
      setEditingId(null);
      await fetchUsers();
    } catch (error) {
      console.error("Failed to update user:", error);
      alert("更新失败");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">用户管理</h1>
          <p className="text-xs text-slate-500 mt-1">管理系统用户与角色权限</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1f233a] text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">用户</th>
                  <th className="text-left px-4 py-3 font-medium">昵称</th>
                  <th className="text-left px-4 py-3 font-medium">角色</th>
                  <th className="text-left px-4 py-3 font-medium">注册时间</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 dark:border-[#1f233a]/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-700 dark:text-slate-200">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{user.nickname || "-"}</td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="student">student</option>
                          <option value="teacher">teacher</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                            : user.role === "teacher"
                            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                        }`}>
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateRole(user.id)}
                            className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
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
                          className="text-xs px-3 py-1 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                        >
                          编辑角色
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
