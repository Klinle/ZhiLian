"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import { Loader2, Plus, Trash2, Pencil, Award, X, Sparkles, Brain, Check, RefreshCw } from "lucide-react";

export default function AdminLabsPage() {
  const [labs, setLabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLab, setEditingLab] = useState<any>(null);
  
  // 批量出题相关状态
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [nodes, setNodes] = useState<any[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [batchParams, setBatchParams] = useState({
    node_id: "",
    exercise_type: "quiz",
    difficulty: "medium",
    count: 3
  });
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [generatedLabs, setGeneratedLabs] = useState<any[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);

  const { apiKeys, openaiApiKey, model: settingsModel, baseUrls } = useSettingsStore();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    starter_code: "",
    test_cases: "",
    node_id: "",
    difficulty: "medium",
    lab_type: "code",
    detailed_explanation: "",
  });

  const currentModel = SUPPORTED_MODELS.find((m) => m.id === settingsModel);
  const provider = currentModel?.provider || "openai";
  const apiKey = apiKeys[provider] || (provider === "openai" ? openaiApiKey : "") || "";
  const baseUrl = baseUrls[provider] || "";

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

  const fetchNodes = useCallback(async () => {
    setNodesLoading(true);
    try {
      const data = await adminApi.listKnowledgeNodes();
      setNodes(data);
      if (data.length > 0 && !batchParams.node_id) {
        setBatchParams((prev) => ({ ...prev, node_id: data[0].id }));
      }
    } catch (error) {
      console.error("Failed to fetch nodes:", error);
    } finally {
      setNodesLoading(false);
    }
  }, [batchParams.node_id]);

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
      detailed_explanation: "",
    });
    setEditingLab(null);
    setShowForm(false);
  };

  const getJsonTemplate = (type: string) => {
    switch (type) {
      case "quiz":
        return `{\n  "questions": [\n    {\n      "id": "q1",\n      "text": "TCP 属于哪一层协议？",\n      "options": ["应用层", "传输层", "网络层", "物理层"],\n      "answer": 1\n    }\n  ]\n}`;
      case "match":
        return `{\n  "left": ["IP 协议", "TCP 协议"],\n  "right": ["负责邮局选址", "负责送货到家"],\n  "pairs": {\n    "IP 协议": "负责邮局选址",\n    "TCP 协议": "负责送货到家"\n  }\n}`;
      case "arrange":
        return `{\n  "steps": [\n    "发送 SYN 报文",\n    "接收 SYN+ACK 报文并发送 ACK",\n    "连接正式建立"\n  ],\n  "correct_order": [0, 1, 2]\n}`;
      case "fill":
        return `{\n  "text": "TCP 协议位于___层，而 IP 协议位于___层。",\n  "blanks": ["传输", "网络"]\n}`;
      default:
        return `{\n  "input": "test",\n  "expected": "output"\n}`;
    }
  };

  // 当切换题型且 test_cases 为空时，自动填入对应题型的模版
  useEffect(() => {
    if (showForm && !formData.test_cases) {
      setFormData((prev) => ({
        ...prev,
        test_cases: getJsonTemplate(prev.lab_type),
      }));
    }
  }, [formData.lab_type, showForm]);

  const handleEdit = (lab: any) => {
    setEditingLab(lab);
    setFormData({
      title: lab.title || "",
      description: lab.description || "",
      starter_code: lab.starter_code || "",
      test_cases: lab.test_cases ? JSON.stringify(lab.test_cases, null, 2) : "",
      node_id: lab.node_id || "",
      difficulty: lab.difficulty || "medium",
      lab_type: lab.lab_type || "code",
      detailed_explanation: lab.detailed_explanation || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    try {
      const data: Record<string, any> = {
        title: formData.title,
        description: formData.description || null,
        difficulty: formData.difficulty,
        lab_type: formData.lab_type,
        detailed_explanation: formData.detailed_explanation || null,
      };
      
      if (formData.starter_code) {
        data.starter_code = formData.starter_code;
      }
      
      if (formData.test_cases) {
        try {
          data.test_cases = JSON.parse(formData.test_cases);
        } catch {
          alert("测试用例 JSON 格式不正确，请修改后重试！");
          return;
        }
      }
      
      if (formData.node_id) {
        data.node_id = formData.node_id;
      }

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

  // 打开批量生成模态框并获取节点列表
  const handleOpenBatchModal = () => {
    fetchNodes();
    setGeneratedLabs([]);
    setShowBatchModal(true);
  };

  // AI 并发批量出题
  const handleGenerateBatch = async () => {
    if (!batchParams.node_id) {
      alert("请先选择关联知识节点！");
      return;
    }
    setBatchGenerating(true);
    setGeneratedLabs([]);
    try {
      const result = await adminApi.generateBatchLabs({
        node_id: batchParams.node_id,
        exercise_type: batchParams.exercise_type,
        difficulty: batchParams.difficulty,
        count: Number(batchParams.count),
        api_key: apiKey,
        model: settingsModel,
        base_url: baseUrl
      });
      
      // 给生成的题目增加本地临时 key
      const list = (result.labs || []).map((l: any, idx: number) => ({
        ...l,
        localId: idx,
        test_cases: l.test_cases ? JSON.stringify(l.test_cases, null, 2) : ""
      }));
      setGeneratedLabs(list);
    } catch (error: any) {
      console.error("Failed to batch generate labs:", error);
      alert(error.message || "批量出题失败，请检查 API Key 等配置。");
    } finally {
      setBatchGenerating(false);
    }
  };

  // 修改生成的题目属性
  const handleEditGeneratedField = (localId: number, field: string, value: string) => {
    setGeneratedLabs((prev) =>
      prev.map((lab) => (lab.localId === localId ? { ...lab, [field]: value } : lab))
    );
  };

  // 删除某道生成的题目卡片
  const handleDeleteGeneratedLab = (localId: number) => {
    setGeneratedLabs((prev) => prev.filter((lab) => lab.localId !== localId));
  };

  // 批量导入数据库
  const handleBatchSave = async () => {
    if (generatedLabs.length === 0) return;
    
    // 数据比对和 JSON 解析校验
    const labsToSave = [];
    for (let i = 0; i < generatedLabs.length; i++) {
      const lab = generatedLabs[i];
      let testCasesObj = {};
      
      if (lab.test_cases) {
        try {
          testCasesObj = JSON.parse(lab.test_cases);
        } catch {
          alert(`题目 ${i + 1}「${lab.title}」的测试用例 JSON 格式有误，请检查修正后重试！`);
          return;
        }
      }

      labsToSave.push({
        title: lab.title,
        description: lab.description || null,
        starter_code: lab.starter_code || null,
        test_cases: testCasesObj,
        node_id: lab.node_id || null,
        difficulty: lab.difficulty || "medium",
        lab_type: lab.lab_type || "code",
        detailed_explanation: lab.detailed_explanation || null,
      });
    }

    setBatchSaving(true);
    try {
      await adminApi.batchSaveLabs({ labs: labsToSave });
      alert("批量导入成功！");
      setShowBatchModal(false);
      await fetchLabs();
    } catch (error: any) {
      console.error("Batch save failed:", error);
      alert(error.message || "批量保存入库失败！");
    } finally {
      setBatchSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">实验管理</h1>
            <p className="text-xs text-slate-500 mt-1">管理代码实操与选择题、连线题、排序题、填空题等趣味题库</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleOpenBatchModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold hover:from-indigo-650 hover:to-purple-750 transition-all shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 智能批量出题
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              新建实验
            </button>
          </div>
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
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                        lab.lab_type === "quiz"
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                          : lab.lab_type === "match"
                          ? "bg-purple-50 dark:bg-purple-950/40 text-purple-650 dark:text-purple-400"
                          : lab.lab_type === "arrange"
                          ? "bg-amber-50 dark:bg-amber-955/40 text-amber-600 dark:text-amber-400"
                          : lab.lab_type === "fill"
                          ? "bg-cyan-50 dark:bg-cyan-955/40 text-cyan-600 dark:text-cyan-400"
                          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {lab.lab_type}
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

        {/* AI 批量出题 Modal */}
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-[#121424] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#121424] rounded-t-2xl shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <h2 className="font-bold text-sm text-slate-900 dark:text-white">AI 智能批量出题控制台</h2>
                </div>
                <button
                  onClick={() => setShowBatchModal(false)}
                  disabled={batchSaving}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-30"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
                
                {/* Left Parameter Column */}
                <div className="w-full md:w-80 shrink-0 space-y-4 border-r border-slate-100 dark:border-slate-850 pr-0 md:pr-6">
                  <h3 className="text-xs font-bold text-slate-850 dark:text-white flex items-center gap-1">
                    <Brain className="h-3.5 w-3.5 text-indigo-500" />
                    第 1 步：配置出题参数
                  </h3>
                  
                  {/* 选择知识节点 */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">聚焦知识节点 *</label>
                    {nodesLoading ? (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <select
                        value={batchParams.node_id}
                        onChange={(e) => setBatchParams({ ...batchParams, node_id: e.target.value })}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                      >
                        {nodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            [{node.category || "未分类"}] {node.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* 题型选择 */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">选择出题类型 *</label>
                    <select
                      value={batchParams.exercise_type}
                      onChange={(e) => setBatchParams({ ...batchParams, exercise_type: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                    >
                      <option value="quiz">单项选择题 (Quiz)</option>
                      <option value="match">生活类比连线题 (Match)</option>
                      <option value="arrange">步骤/逻辑排序题 (Arrange)</option>
                      <option value="fill">概念关键字填空题 (Fill)</option>
                      <option value="code">代码编程实操题 (Code)</option>
                    </select>
                  </div>

                  {/* 难度选择 */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">选择练习难度 *</label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                      {["easy", "medium", "hard"].map((diff) => (
                        <button
                          key={diff}
                          onClick={() => setBatchParams({ ...batchParams, difficulty: diff })}
                          className={`py-1.5 rounded text-[10px] font-bold capitalize transition-all ${
                            batchParams.difficulty === diff
                              ? "bg-white dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 数量选择 */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">选择生成题目数量 *</label>
                    <select
                      value={batchParams.count}
                      onChange={(e) => setBatchParams({ ...batchParams, count: Number(e.target.value) })}
                      className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                    >
                      <option value={1}>1 道题</option>
                      <option value={3}>3 道题</option>
                      <option value={5}>5 道题</option>
                    </select>
                  </div>

                  {/* 针对出题大按钮 */}
                  <button
                    onClick={handleGenerateBatch}
                    disabled={batchGenerating || batchSaving}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-750 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {batchGenerating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        AI 并发生成中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        呼叫 AI 智能生成
                      </>
                    )}
                  </button>
                </div>

                {/* Right Preview Column */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                  <h3 className="text-xs font-bold text-slate-850 dark:text-white flex items-center gap-1 mb-4 shrink-0">
                    <Check className="h-3.5 w-3.5 text-indigo-500" />
                    第 2 步：生成的题目预览与微调
                  </h3>

                  {batchGenerating ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                      <span className="text-xs">AI Agent 正在并发大语言模型，并自动装配原理解析与测试用例 JSON...</span>
                      <span className="text-[10px] text-slate-500">这通常需要 10 - 20 秒，请稍候。</span>
                    </div>
                  ) : generatedLabs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8">
                      暂无生成的数据。请在左侧面板配置出题参数并点击“呼叫 AI 智能生成”。
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                      {generatedLabs.map((lab, index) => (
                        <div
                          key={lab.localId}
                          className="bg-slate-50/50 dark:bg-slate-800/10 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 relative space-y-4"
                        >
                          {/* 删除卡片按钮 */}
                          <button
                            onClick={() => handleDeleteGeneratedLab(lab.localId)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-500 transition-all"
                            title="删除该题"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>

                          <div className="text-[10px] font-bold text-indigo-500 font-mono">
                            # 题目卡片 {index + 1}
                          </div>

                          {/* 标题 */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">题目标题 *</label>
                            <input
                              value={lab.title}
                              onChange={(e) => handleEditGeneratedField(lab.localId, "title", e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 font-medium text-slate-800 dark:text-slate-100"
                              placeholder="题目标题"
                            />
                          </div>

                          {/* 描述 */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">题目描述/题干</label>
                            <textarea
                              value={lab.description}
                              onChange={(e) => handleEditGeneratedField(lab.localId, "description", e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 min-h-[50px] leading-relaxed"
                              placeholder="题目描述"
                            />
                          </div>

                          {/* 原理解析 */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">原理解释说明 (用于 AI 导师类比讲解)</label>
                            <textarea
                              value={lab.detailed_explanation}
                              onChange={(e) => handleEditGeneratedField(lab.localId, "detailed_explanation", e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 min-h-[60px] leading-relaxed"
                              placeholder="原理解释"
                            />
                          </div>

                          {/* 起始代码（如果是代码题） */}
                          {lab.lab_type === "code" && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-1">编程初始代码</label>
                              <textarea
                                value={lab.starter_code}
                                onChange={(e) => handleEditGeneratedField(lab.localId, "starter_code", e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-slate-900 text-slate-100 font-mono border border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 min-h-[60px]"
                                placeholder="starter_code"
                              />
                            </div>
                          )}

                          {/* 用例 JSON */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">测试用例 (JSON 格式化字符串)</label>
                            <textarea
                              value={lab.test_cases}
                              onChange={(e) => handleEditGeneratedField(lab.localId, "test_cases", e.target.value)}
                              className="w-full text-[11px] px-3 py-2 bg-slate-900 text-slate-100 font-mono border border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 min-h-[100px] leading-relaxed"
                              placeholder="JSON test cases"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#121424] rounded-b-2xl shrink-0">
                <button
                  onClick={() => setShowBatchModal(false)}
                  disabled={batchSaving}
                  className="px-4 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchSave}
                  disabled={generatedLabs.length === 0 || batchSaving || batchGenerating}
                  className="px-5 py-2 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-750 text-white font-bold transition-all disabled:opacity-45 disabled:pointer-events-none flex items-center gap-1.5 shadow-sm"
                >
                  {batchSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      正在保存到题库...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      确认批量导入内置题库 ({generatedLabs.length} 道)
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Create/Edit Form Modal (手动表单出题，保持 T31 原样) */}
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
                      onChange={(e) => setFormData({ ...formData, lab_type: e.target.value, test_cases: "" })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="code">代码实操</option>
                      <option value="quiz">选择题 (Quiz)</option>
                      <option value="match">连线题 (Match)</option>
                      <option value="arrange">排序题 (Arrange)</option>
                      <option value="fill">填空题 (Fill)</option>
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
                
                {/* 原理解析说明 */}
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">详细解答/原理解析 (用于 AI 互动讲解)</label>
                  <textarea
                    value={formData.detailed_explanation}
                    onChange={(e) => setFormData({ ...formData, detailed_explanation: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
                    placeholder="请输入详细的通俗原理解答..."
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
                  <label className="text-xs font-medium text-slate-500 block mb-1 flex items-center justify-between">
                    <span>测试用例 (JSON) *</span>
                    <span className="text-[9px] text-indigo-500 font-mono">当前配置模版已载入</span>
                  </label>
                  <textarea
                    value={formData.test_cases}
                    onChange={(e) => setFormData({ ...formData, test_cases: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[120px] leading-relaxed"
                    placeholder='{"questions": [...] }'
                    spellCheck={false}
                  />
                  <div className="mt-1.5 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-lg text-[9px] text-slate-400 font-sans leading-normal">
                    <strong>配置提示：</strong>
                    {formData.lab_type === "quiz" && "选择题 JSON 需包含 questions 数组，内含 id, text, options 数组与答案索引 answer。"}
                    {formData.lab_type === "match" && "连线题 JSON 需包含 left, right 的数据数组与 pairs 键值对映射关系。"}
                    {formData.lab_type === "arrange" && "排序题 JSON 需包含 steps 步骤文字数组与 correct_order 下标正确顺序。"}
                    {formData.lab_type === "fill" && "填空题 JSON 需包含 text 挖空字符串（下划线 ___ 占位）与 blanks 标准关键字答案数组。"}
                    {formData.lab_type === "code" && "编程题 JSON 可定义 test_cases 输入输出对用例。"}
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!formData.title}
                    className="px-4 py-2 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
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
