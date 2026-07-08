"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, Plus, Pencil, Bot, X, Power } from "lucide-react";

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    role_type: "humor_mentor",
    system_prompt: "",
    description: "",
    is_active: 1,
  });

  const fetchAgents = useCallback(async () => {
    try {
      const data = await adminApi.listAgents();
      setAgents(data);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const resetForm = () => {
    setFormData({
      name: "",
      role_type: "humor_mentor",
      system_prompt: "",
      description: "",
      is_active: 1,
    });
    setEditingAgent(null);
    setShowForm(false);
  };

  const handleEdit = (agent: any) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name || "",
      role_type: agent.role_type || "humor_mentor",
      system_prompt: agent.system_prompt || "",
      description: agent.description || "",
      is_active: agent.is_active ?? 1,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    try {
      const data: Record<string, unknown> = {
        name: formData.name,
        role_type: formData.role_type,
        system_prompt: formData.system_prompt,
        description: formData.description || null,
      };

      if (editingAgent) {
        data.is_active = formData.is_active;
        await adminApi.updateAgent(editingAgent.id, data);
      } else {
        await adminApi.createAgent(data);
      }
      resetForm();
      await fetchAgents();
    } catch (error) {
      console.error("Failed to save agent:", error);
      alert("保存失败");
    }
  };

  const handleToggleActive = async (agent: any) => {
    try {
      await adminApi.updateAgent(agent.id, { is_active: agent.is_active ? 0 : 1 });
      await fetchAgents();
    } catch (error) {
      console.error("Failed to toggle agent:", error);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Agent 管理</h1>
            <p className="text-xs text-slate-500 mt-1">管理智能导师 Agent 与系统提示词</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            新建 Agent
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">暂无 Agent</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      agent.is_active
                        ? "bg-indigo-500/10 text-indigo-500"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                    }`}>
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">{agent.name}</h3>
                      <p className="text-xs text-slate-400">{agent.role_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(agent)}
                      className={`p-1.5 rounded transition-colors ${
                        agent.is_active
                          ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                      title={agent.is_active ? "已启用" : "已禁用"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleEdit(agent)}
                      className="p-1.5 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                      title="编辑"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {agent.description && (
                  <p className="text-xs text-slate-500 mb-2 line-clamp-2">{agent.description}</p>
                )}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 max-h-24 overflow-y-auto">
                  <p className="text-[11px] text-slate-400 font-mono line-clamp-3 whitespace-pre-wrap">
                    {agent.system_prompt}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    agent.is_active
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  }`}>
                    {agent.is_active ? "已启用" : "已禁用"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-[#121424] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#1f233a] sticky top-0 bg-white dark:bg-[#121424] z-10">
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                  {editingAgent ? "编辑 Agent" : "新建 Agent"}
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">名称 *</label>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Agent 名称"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">角色类型</label>
                  <select
                    value={formData.role_type}
                    onChange={(e) => setFormData({ ...formData, role_type: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="humor_mentor">humor_mentor</option>
                    <option value="academic_mentor">academic_mentor</option>
                    <option value="coach_mentor">coach_mentor</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">描述</label>
                  <input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Agent 描述"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">系统提示词 *</label>
                  <textarea
                    value={formData.system_prompt}
                    onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[150px]"
                    placeholder="system_prompt..."
                    spellCheck={false}
                  />
                </div>
                {editingAgent && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">状态</label>
                    <select
                      value={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: Number(e.target.value) })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value={1}>启用</option>
                      <option value={0}>禁用</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!formData.name || !formData.system_prompt}
                    className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {editingAgent ? "保存" : "创建"}
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
