"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import type { Lab, GeneratedLab, LabFilterParams, KnowledgeNode, NodeContextPreview, GenerateBatchResult } from "@/types";
import {
  Loader2, Plus, Trash2, Pencil, Award, X, Sparkles, Brain, Check,
  Search, Calendar, CheckCircle2, BookOpen, FileText, AlertTriangle,
} from "lucide-react";

// 题型显示名称映射
const LAB_TYPE_LABELS: Record<string, string> = {
  code: "编程题",
  quiz: "选择题",
  match: "连线题",
  arrange: "排序题",
  fill: "填空题",
};

// 题型标签颜色映射
const LAB_TYPE_COLORS: Record<string, string> = {
  quiz: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  match: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400",
  arrange: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  fill: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400",
  code: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
};

// 难度标签颜色映射
const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  hard: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
};

// 知识节点分类中文名映射
const CATEGORY_LABELS: Record<string, string> = {
  programming: "终端游戏与工具",
  dsa: "益智游戏数据",
  organization: "街机游戏设计",
  os: "实时动作并发",
  network: "联机对战服务",
  database: "数据与工程",
};

// 分类颜色映射
const CATEGORY_COLORS: Record<string, string> = {
  programming: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  dsa: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400",
  organization: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  os: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400",
  network: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  database: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
};

interface LabFormData {
  title: string;
  description: string;
  starter_code: string;
  test_cases: string;
  node_id: string;
  difficulty: string;
  lab_type: string;
  detailed_explanation: string;
}

interface BatchParamsState {
  node_id: string;
  exercise_type: string;
  difficulty: string;
  count: number;
}

export default function AdminLabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);

  // 批量选择与批量删除状态
  const [selectedLabIds, setSelectedLabIds] = useState<string[]>([]);
  // 未经过滤的总题数（用于防止筛选结果为空时整个操作栏消失）
  const [totalCount, setTotalCount] = useState(0);

  // 筛选状态
  const [filterParams, setFilterParams] = useState<LabFilterParams>({});
  const [searchInput, setSearchInput] = useState("");

  // 批量出题相关状态
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [batchParams, setBatchParams] = useState<BatchParamsState>({
    node_id: "",
    exercise_type: "quiz",
    difficulty: "medium",
    count: 3,
  });
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [generatedLabs, setGeneratedLabs] = useState<GeneratedLab[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);

  // 知识节点搜索与上下文预览
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeContext, setNodeContext] = useState<NodeContextPreview | null>(null);
  const [nodeContextLoading, setNodeContextLoading] = useState(false);
  const [contextInfo, setContextInfo] = useState<GenerateBatchResult["context_info"] | null>(null);

  const { apiKeys, openaiApiKey, model: settingsModel, baseUrls } = useSettingsStore();

  const [formData, setFormData] = useState<LabFormData>({
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

  // 题库统计（前端计算）
  const stats = useMemo(() => {
    const total = labs.length;
    const byType: Record<string, number> = {};
    const byDifficulty: Record<string, number> = {};
    let withExplanation = 0;

    labs.forEach((lab) => {
      const t = lab.lab_type || "code";
      byType[t] = (byType[t] || 0) + 1;
      const d = lab.difficulty || "medium";
      byDifficulty[d] = (byDifficulty[d] || 0) + 1;
      if (lab.has_explanation) withExplanation++;
    });

    return { total, byType, byDifficulty, withExplanation };
  }, [labs]);

  // 当前选中的知识节点（用于上下文预览）
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === batchParams.node_id) || null,
    [nodes, batchParams.node_id],
  );

  const fetchLabs = useCallback(async (params?: LabFilterParams) => {
    try {
      const data = await adminApi.listLabs(params);
      setLabs(data);
      // 如果没有筛选参数，更新 unfiltered 题库总题数
      if (!params || (!params.lab_type && !params.difficulty && !params.search)) {
        setTotalCount(data.length);
      }
      setSelectedLabIds([]); // 每次重载数据均清空选中缓存
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

  // 初始加载
  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  // 筛选/搜索防抖（跳过首次渲染避免重复请求）
  const skipDebounceRef = useRef(true);
  useEffect(() => {
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchLabs({ ...filterParams, search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [filterParams, searchInput, fetchLabs]);

  // 选中知识节点后加载上下文预览
  useEffect(() => {
    if (!batchParams.node_id) {
      setNodeContext(null);
      return;
    }
    setNodeContextLoading(true);
    adminApi
      .getNodeContext(batchParams.node_id)
      .then(setNodeContext)
      .catch((err) => {
        console.error("Failed to fetch node context:", err);
        setNodeContext(null);
      })
      .finally(() => setNodeContextLoading(false));
  }, [batchParams.node_id]);

  // 按搜索关键词过滤的知识节点列表
  const filteredNodes = useMemo(() => {
    if (!nodeSearch.trim()) return nodes;
    const q = nodeSearch.toLowerCase();
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.code.toLowerCase().includes(q),
    );
  }, [nodes, nodeSearch]);

  // 按分类分组的知识节点
  const groupedNodes = useMemo(() => {
    const groups: Record<string, KnowledgeNode[]> = {};
    filteredNodes.forEach((n) => {
      const cat = n.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(n);
    });
    return groups;
  }, [filteredNodes]);

  // 筛选变化处理
  const handleFilterChange = (key: keyof LabFilterParams, value: string) => {
    setFilterParams((prev) => ({ ...prev, [key]: value || undefined }));
  };

  // 重置筛选
  const handleResetFilter = () => {
    setFilterParams({});
    setSearchInput("");
  };

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

  const handleEdit = (lab: Lab) => {
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
      const data: Record<string, unknown> = {
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
      await fetchLabs({ ...filterParams, search: searchInput || undefined });
    } catch (error) {
      console.error("Failed to save lab:", error);
      alert("保存失败");
    }
  };

  const handleDelete = async (labId: string) => {
    if (!confirm("确定要删除这道题目吗？")) return;
    try {
      await adminApi.deleteLab(labId);
      await fetchLabs({ ...filterParams, search: searchInput || undefined });
    } catch (error) {
      console.error("Failed to delete lab:", error);
      alert("删除失败");
    }
  };

  const handleSelectLab = (labId: string) => {
    setSelectedLabIds((prev) =>
      prev.includes(labId) ? prev.filter((id) => id !== labId) : [...prev, labId]
    );
  };

  const handleSelectAll = () => {
    if (labs.length === 0) return;
    if (selectedLabIds.length === labs.length) {
      setSelectedLabIds([]);
    } else {
      setSelectedLabIds(labs.map((lab) => lab.id));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedLabIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedLabIds.length} 道题目吗？`)) return;
    try {
      await adminApi.batchDeleteLabs(selectedLabIds);
      setSelectedLabIds([]);
      await fetchLabs({ ...filterParams, search: searchInput || undefined });
    } catch (error) {
      console.error("Failed to batch delete labs:", error);
      alert("批量删除失败");
    }
  };

  // 打开批量生成模态框并获取节点列表
  const handleOpenBatchModal = () => {
    fetchNodes();
    setGeneratedLabs([]);
    setContextInfo(null);
    setNodeSearch("");
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
        base_url: baseUrl,
      });

      setContextInfo(result.context_info || null);

      // 给生成的题目增加本地临时 key
      const list: GeneratedLab[] = (result.labs || []).map((l, idx) => ({
        localId: idx,
        title: (l.title as string) || "",
        description: (l.description as string) || "",
        starter_code: (l.starter_code as string) || "",
        test_cases: l.test_cases ? JSON.stringify(l.test_cases, null, 2) : "",
        difficulty: (l.difficulty as string) || batchParams.difficulty,
        lab_type: (l.lab_type as string) || batchParams.exercise_type,
        detailed_explanation: (l.detailed_explanation as string) || (l.explanation as string) || "",
        node_id: batchParams.node_id,
      }));
      setGeneratedLabs(list);
    } catch (error: unknown) {
      console.error("Failed to batch generate labs:", error);
      const msg = error instanceof Error ? error.message : "批量出题失败，请检查 API Key 等配置。";
      alert(msg);
    } finally {
      setBatchGenerating(false);
    }
  };

  // 修改生成的题目属性
  const handleEditGeneratedField = (localId: number, field: string, value: string) => {
    setGeneratedLabs((prev) =>
      prev.map((lab) =>
        lab.localId === localId
          ? ({ ...lab, [field]: value } as GeneratedLab)
          : lab,
      ),
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
    const labsToSave: Record<string, unknown>[] = [];
    for (let i = 0; i < generatedLabs.length; i++) {
      const lab = generatedLabs[i];
      let testCasesObj: Record<string, unknown> = {};

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
      alert("批量导入题库成功！");
      setShowBatchModal(false);
      await fetchLabs({ ...filterParams, search: searchInput || undefined });
    } catch (error: unknown) {
      console.error("Batch save failed:", error);
      const msg = error instanceof Error ? error.message : "批量导入题库失败！";
      alert(msg);
    } finally {
      setBatchSaving(false);
    }
  };

  const hasActiveFilter = !!(filterParams.lab_type || filterParams.difficulty || filterParams.search || searchInput);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">题库管理</h1>
            <p className="text-xs text-slate-500 mt-1">管理内置题库 — AI 智能批量出题 + 手动录入，覆盖选择/连线/排序/填空/编程五大题型</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleOpenBatchModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm"
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
              手动录入题目
            </button>
          </div>
        </div>

        {/* 统计概览卡片 */}
        {!loading && (totalCount > 0 || hasActiveFilter) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <Award className="h-3.5 w-3.5" />
                总题数
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.total}</div>
            </div>
            <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <BookOpen className="h-3.5 w-3.5" />
                题型分布
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-1.5">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <span key={type} className={`px-1.5 py-0.5 rounded ${LAB_TYPE_COLORS[type] || ""}`}>
                    {LAB_TYPE_LABELS[type] || type} {count}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <Brain className="h-3.5 w-3.5" />
                难度分布
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap gap-1.5">
                {Object.entries(stats.byDifficulty).map(([diff, count]) => (
                  <span key={diff} className={`px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[diff] || ""}`}>
                    {diff} {count}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                解析覆盖率
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {stats.withExplanation}<span className="text-sm text-slate-400">/{stats.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* 筛选/搜索栏 */}
        {!loading && (totalCount > 0 || hasActiveFilter) && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索题目标题..."
                className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={filterParams.lab_type || ""}
              onChange={(e) => handleFilterChange("lab_type", e.target.value)}
              className="text-xs px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
            >
              <option value="">全部题型</option>
              <option value="code">编程题</option>
              <option value="quiz">选择题</option>
              <option value="match">连线题</option>
              <option value="arrange">排序题</option>
              <option value="fill">填空题</option>
            </select>
            <select
              value={filterParams.difficulty || ""}
              onChange={(e) => handleFilterChange("difficulty", e.target.value)}
              className="text-xs px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
            >
              <option value="">全部难度</option>
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
            </select>
            {hasActiveFilter && (
              <button
                onClick={handleResetFilter}
                className="text-xs px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                重置
              </button>
            )}
            {selectedLabIds.length > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm ml-auto"
              >
                <Trash2 className="h-3.5 w-3.5" />
                批量删除 ({selectedLabIds.length} 项)
              </button>
            )}
          </div>
        )}

        {/* 题库列表表格 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            题库为空，请使用 AI 批量出题或手动录入
          </div>
        ) : labs.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            未找到符合筛选条件的题目，建议{" "}
            <button onClick={handleResetFilter} className="text-indigo-500 underline font-semibold">
              重置筛选
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1f233a] text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium w-10 text-left">
                    <input
                      type="checkbox"
                      checked={labs.length > 0 && selectedLabIds.length === labs.length}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-800 text-indigo-650 focus:ring-indigo-500/20 w-3.5 h-3.5 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">标题</th>
                  <th className="text-left px-4 py-3 font-medium">题型</th>
                  <th className="text-left px-4 py-3 font-medium">难度</th>
                  <th className="text-left px-4 py-3 font-medium">关联节点</th>
                  <th className="text-left px-4 py-3 font-medium">创建时间</th>
                  <th className="text-left px-4 py-3 font-medium">解析</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab.id} className="border-b border-slate-100 dark:border-[#1f233a]/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedLabIds.includes(lab.id)}
                        onChange={() => handleSelectLab(lab.id)}
                        className="rounded border-slate-300 dark:border-slate-800 text-indigo-650 focus:ring-indigo-500/20 w-3.5 h-3.5 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-md">{lab.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${LAB_TYPE_COLORS[lab.lab_type || "code"] || ""}`}>
                        {LAB_TYPE_LABELS[lab.lab_type || "code"] || lab.lab_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${DIFFICULTY_COLORS[lab.difficulty || "medium"] || ""}`}>
                        {lab.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lab.node_name ? (
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {lab.node_category && (
                            <span className="text-[10px] text-slate-400 mr-1">[{lab.node_category}]</span>
                          )}
                          {lab.node_name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">未关联</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lab.created_at && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Calendar className="h-3 w-3" />
                          {lab.created_at.split("T")[0]}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lab.has_explanation ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
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
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400">聚焦知识节点 *</label>
                    {nodesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <>
                        {/* 搜索框 */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                          <input
                            type="text"
                            value={nodeSearch}
                            onChange={(e) => setNodeSearch(e.target.value)}
                            placeholder="搜索节点名称 / 描述..."
                            className="w-full text-[11px] pl-7 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        {/* 分类分组的节点列表 */}
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                          {Object.entries(groupedNodes).length === 0 ? (
                            <div className="text-[10px] text-slate-400 text-center py-3">未找到匹配的节点</div>
                          ) : (
                            Object.entries(groupedNodes).map(([cat, catNodes]) => (
                              <div key={cat} className="space-y-1">
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">
                                  {CATEGORY_LABELS[cat] || cat} ({catNodes.length})
                                </div>
                                {catNodes.map((node) => (
                                  <button
                                    key={node.id}
                                    onClick={() => setBatchParams({ ...batchParams, node_id: node.id })}
                                    className={`w-full text-left p-2 rounded-lg border transition-all ${
                                      batchParams.node_id === node.id
                                        ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30"
                                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{node.name}</span>
                                      <span className={`text-[8px] px-1 py-0.5 rounded font-mono shrink-0 ${CATEGORY_COLORS[node.category] || ""}`}>
                                        {node.chunk_count}块
                                      </span>
                                    </div>
                                    {node.lab_count > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className="text-[9px] text-slate-400">已有 {node.lab_count} 题</span>
                                        {Object.entries(node.lab_types).map(([lt, cnt]) => (
                                          <span key={lt} className={`text-[8px] px-1 rounded ${LAB_TYPE_COLORS[lt] || ""}`}>
                                            {LAB_TYPE_LABELS[lt] || lt} {cnt}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 知识上下文预览 */}
                  {selectedNode && (
                    <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500">
                          <BookOpen className="h-3 w-3" />
                          知识上下文预览
                        </div>
                        {nodeContextLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                        ) : nodeContext ? (
                          <span className="text-[9px] text-slate-500 font-mono">
                            {nodeContext.chunk_count} 均块 / {nodeContext.total_chars} 字符
                          </span>
                        ) : null}
                      </div>
                      {selectedNode.description && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {selectedNode.description}
                        </div>
                      )}
                      {/* 实际分块预览 */}
                      {nodeContext && !nodeContextLoading ? (
                        nodeContext.chunk_count === 0 ? (
                          <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>该节点暂无关联知识文档，AI 将仅基于节点描述出题，建议先上传文档</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {nodeContext.preview_chunks.slice(0, 3).map((chunk, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                              <FileText className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[9px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed break-all">
                                    {chunk.content || "(空内容)"}
                                  </p>
                                  {(chunk.element_type || chunk.page_number) && (
                                    <div className="flex gap-1 mt-0.5">
                                      {chunk.element_type && (
                                        <span className="text-[8px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">{chunk.element_type}</span>
                                      )}
                                      {chunk.page_number && (
                                        <span className="text-[8px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">P.{chunk.page_number}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {nodeContext.chunk_count > 3 && (
                              <div className="text-[9px] text-slate-400">
                                ...还有 {nodeContext.chunk_count - 3} 个分块
                              </div>
                            )}
                            <div className="text-[9px] text-indigo-500 dark:text-indigo-400 leading-relaxed">
                              AI 将基于以上 {nodeContext.chunk_count} 个知识分块自动注入上下文，生成更精准的题目
                            </div>
                          </div>
                        )
                      ) : null}
                      {/* 快捷操作：查看已有题目 */}
                      {selectedNode && selectedNode.lab_count > 0 && (
                        <button
                          onClick={() => {
                            setFilterParams({ node_id: selectedNode.id });
                            setSearchInput("");
                            setShowBatchModal(false);
                          }}
                          className="text-[10px] text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
                        >
                          <Search className="h-2.5 w-2.5" />
                          查看该节点已有 {selectedNode.lab_count} 道题目
                        </button>
                      )}
                    </div>
                  )}

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
                              ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
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

                  {/* 生成按钮 */}
                  <button
                    onClick={handleGenerateBatch}
                    disabled={batchGenerating || batchSaving}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
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
                  <h3 className="text-xs font-bold text-slate-850 dark:text-white flex items-center gap-1 mb-2 shrink-0">
                    <Check className="h-3.5 w-3.5 text-indigo-500" />
                    第 2 步：生成的题目预览与微调
                  </h3>
                  {contextInfo && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 shrink-0 flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-indigo-400" />
                      基于「{contextInfo.node_name}」的 {contextInfo.chunk_count} 个知识分块（{contextInfo.context_length} 字符）智能生成
                    </div>
                  )}
                  {!contextInfo && (
                    <div className="mb-4 shrink-0" />
                  )}

                  {batchGenerating ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                      <span className="text-xs">AI Agent 正在并发大语言模型，并自动装配原理解析与测试用例 JSON...</span>
                      <span className="text-[10px] text-slate-500">这通常需要 10 - 20 秒，请稍候。</span>
                    </div>
                  ) : generatedLabs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8">
                      暂无生成的数据。请在左侧面板配置出题参数并点击&ldquo;呼叫 AI 智能生成&rdquo;。
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
                                className="w-full text-xs px-3 py-2 bg-slate-900 text-slate-100 font-mono border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 min-h-[60px]"
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
                              className="w-full text-[11px] px-3 py-2 bg-slate-900 text-slate-100 font-mono border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 min-h-[100px] leading-relaxed"
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
                  className="px-5 py-2 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all disabled:opacity-45 disabled:pointer-events-none flex items-center gap-1.5 shadow-sm"
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

        {/* 手动录入/编辑 Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-[#121424] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#1f233a] sticky top-0 bg-white dark:bg-[#121424] z-10">
                <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                  {editingLab ? "编辑题目" : "手动录入题目"}
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">题目标题 *</label>
                  <input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="题目标题"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">题目描述/题干</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[60px]"
                    placeholder="题目描述/题干"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">题型</label>
                    <select
                      value={formData.lab_type}
                      onChange={(e) => setFormData({ ...formData, lab_type: e.target.value, test_cases: "" })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="code">编程题</option>
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
                  <div className="mt-1.5 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg text-[9px] text-slate-400 font-sans leading-normal">
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
