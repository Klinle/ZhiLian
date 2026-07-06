"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, GraduationCap, ChevronRight } from "lucide-react";

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const fetchStudents = useCallback(async () => {
    try {
      const data = await adminApi.listStudents();
      setStudents(data);
    } catch (error) {
      console.error("Failed to fetch students:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleViewProfile = async (studentId: string) => {
    try {
      const data = await adminApi.getStudentProfile(studentId);
      setSelectedStudent(data);
    } catch (error) {
      console.error("Failed to fetch student profile:", error);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">学员概览</h1>
          <p className="text-xs text-slate-500 mt-1">查看学生学习进度与画像</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">暂无学员</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewProfile(s.id)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm">
                    {s.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-700 dark:text-slate-200 truncate">{s.username}</p>
                    <p className="text-xs text-slate-400 truncate">{s.nickname || "无昵称"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2">
                    <div className="text-lg font-bold font-mono text-indigo-500">{s.lighted_nodes}</div>
                    <div className="text-[9px] text-slate-400">点亮节点</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2">
                    <div className="text-lg font-bold font-mono text-emerald-500">{s.passed_labs}</div>
                    <div className="text-[9px] text-slate-400">通过实验</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2">
                    <div className="text-lg font-bold font-mono text-amber-500">{s.total_submissions}</div>
                    <div className="text-[9px] text-slate-400">总提交数</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Student Profile Modal */}
        {selectedStudent && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setSelectedStudent(null)}
          >
            <div
              className="bg-white dark:bg-[#121424] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#1f233a]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm">
                    {selectedStudent.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-slate-900 dark:text-white">{selectedStudent.username}</h2>
                    <p className="text-xs text-slate-400">{selectedStudent.nickname || "无昵称"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm"
                >
                  关闭
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold font-mono text-indigo-500">
                      {selectedStudent.stats?.lighted_nodes ?? 0}/{selectedStudent.stats?.total_nodes ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">点亮知识点</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold font-mono text-emerald-500">
                      {selectedStudent.stats?.pass_rate ?? 0}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">实验通过率</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold font-mono text-amber-500">
                      {selectedStudent.stats?.study_duration_hours ?? 0}h
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">学习时长</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold font-mono text-purple-500">
                      {selectedStudent.stats?.memory_count ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">记忆条目</div>
                  </div>
                </div>

                {/* Radar Data */}
                {selectedStudent.radar?.values && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 mb-2">能力维度</h3>
                    <div className="space-y-2">
                      {selectedStudent.radar.values.map((v: any) => (
                        <div key={v.direction} className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{v.direction}</span>
                            <span className="text-xs font-mono text-slate-400">{v.lighted}/{v.total} · {v.coverage}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
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
