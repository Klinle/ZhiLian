"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, Plus, Trash2, Pencil, Award, X } from "lucide-react";

export default function AdminLabsPage() {
  const [labs, setLabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLab, setEditingLab] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    starter_code: "",
    test_cases: "",
    node_id: "",
    difficulty: "medium",
    lab_type: "code",
  });

  const fetchLabs = useCallback(async () => {
    try {
      const data = await adminApi.listLabs();
      setLabs(data);
    } catch (error) {
      console.error("Failed to fetch labs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      starter_code: "",
      test_cases: "",
      node_id: "",
      difficulty: "medium",
      lab_type: "code",
    });
    setEditingLab(null);
    setShowForm(false);
  };

  const handleEdit = (lab: any) => {
    setEditingLab(lab);
    setFormData({
      title: lab.title || "",
      description: lab.description || "",
      starter_code: "",
      test_cases: "",
      node_id: lab.node_id || "",
      difficulty: lab.difficulty || "medium",
      lab_type: lab.lab_type || "code",
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    try {
      const data: Record<string, unknown> = {
        title: formData.title,
        description: formData.description || null,
        difficulty: formData.difficulty,
        lab_type: formData.lab_type,
      };
      if (formData.starter_code) data.starter_code = formData.starter_code;
      if (formData.test_cases) {
        try {
          data.test_cases = JSON.parse(formData.test_cases);
        } catch {
          // ignore parse error
        }
      }
      if (formData.node_id) data.node_id = formData.node_id;

      if (editingLab) {
        await adminApi.updateLab(editingLab.id, data);
      } else {
        await adminApi.createLab(data);
      }
      resetForm();
      await fetchLabs();
    } catch (error) {
      console.error("Failed to save lab:", error);
      alert("保存失败");
    }
  };

  const handleDelete = async (labId: string) => {
    if (!confirm("确定要删除这个实验吗？")) return;
    try {
      await adminApi.deleteLab(labId);
      await fetchLabs();
    } catch (error) {
      console.error("Failed to delete lab:", error);
      alert("删除失败");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">实验管理</h1>
            <p className="text-xs text-slate-500 mt-1">管理代码实操与选择题实验</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            新建实验
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : labs.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">暂无实验</div>
        ) : (
          <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1f233a] text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">标题</th>
                  <th className="text-left px-4 py-3 font-medium">类型</th>
                  <th className="text-left px-4 py-3 font-medium">难度</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab.id} className="border-b border-slate-100 dark:border-[#1f233a]/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-md">{lab.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        lab.lab_type === "quiz"
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {lab.lab_type === "quiz" ? "选择题" : "代码实操"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        lab.difficulty === "easy"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                          : lab.difficulty === "hard"
                          ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                          : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                      }`}>
                        {lab.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(lab)}
                          className="p-1.5 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                          title="编辑"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(lab.id)}
                          className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-[#121424] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#1f233a] sticky top-0 bg-white dark:bg-[#121424] z-10">
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                  {editingLab ? "编辑实验" : "新建实验"}
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">标题 *</label>
                  <input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="实验标题"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">描述</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[60px]"
                    placeholder="实验描述"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">类型</label>
                    <select
                      value={formData.lab_type}
                      onChange={(e) => setFormData({ ...formData, lab_type: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="code">代码实操</option>
                      <option value="quiz">选择题</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">难度</label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="easy">简单</option>
                      <option value="medium">中等</option>
                      <option value="hard">困难</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">关联知识节点 ID (可选)</label>
                  <input
                    value={formData.node_id}
                    onChange={(e) => setFormData({ ...formData, node_id: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    placeholder="UUID 格式"
                  />
                </div>
                {formData.lab_type === "code" && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">起始代码</label>
                    <textarea
                      value={formData.starter_code}
                      onChange={(e) => setFormData({ ...formData, starter_code: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[100px]"
                      placeholder="starter_code..."
                      spellCheck={false}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">测试用例 (JSON)</label>
                  <textarea
                    value={formData.test_cases}
                    onChange={(e) => setFormData({ ...formData, test_cases: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[100px]"
                    placeholder='{"questions": [...] }'
                    spellCheck={false}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!formData.title}
                    className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {editingLab ? "保存" : "创建"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
