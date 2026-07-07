"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Brain,
  Award,
  Loader2,
  Code2,
  ListChecks,
  Send,
  ChevronRight,
  Sparkles,
  Star,
  Activity,
  Grid3X3,
  RefreshCw,
  FolderHeart,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import { labApi, collectionApi, getAuthHeaders } from "@/lib/api";
import type { Lab, Submission } from "@/types";
import UserLayout from "@/components/user-layout";
import ExerciseRenderer from "@/components/exercise-renderer";
import { cn } from "@/lib/utils";

type ExerciseMode = "system" | "dynamic" | "collection";
type TabMode = "code" | "quiz" | "match" | "arrange" | "fill";

function PracticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get("nodeId");

  const { apiKeys, openaiApiKey, model, baseUrls } = useSettingsStore();

  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>("system");
  const [tabMode, setTabMode] = useState<TabMode>("code");
  const [labs, setLabs] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLab, setSelectedLab] = useState<any | null>(null);
  
  // 代码实操题专属状态
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // AI 针对性出题专属状态
  const [dynamicType, setDynamicType] = useState<string>("quiz");
  const [dynamicDifficulty, setDynamicDifficulty] = useState<string>("medium");
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  // 收藏状态
  const [isCollected, setIsCollected] = useState(false);

  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
      } else {
        setUserRole(localStorage.getItem("cognilink_user_role") || "student");
      }
    }
  }, [router]);

  const currentModel = SUPPORTED_MODELS.find((m) => m.id === model);
  const provider = currentModel?.provider || "openai";
  const apiKey = apiKeys[provider] || (provider === "openai" ? openaiApiKey : "") || "";
  const baseUrl = baseUrls[provider] || "";

  // 1. 获取系统内置题库
  const fetchLabs = useCallback(async (mode: TabMode, filterNodeId?: string | null) => {
    setLoading(true);
    try {
      const data = await labApi.listLabs({ 
        lab_type: mode,
        node_id: filterNodeId || undefined
      });
      setLabs(data);
      if (data.length > 0) {
        const lab = await labApi.getLab(data[0].id);
        setSelectedLab(fullfillLabType(lab));
        setCode(lab.starter_code || "");
        setEvalResult(null);
        try {
          const subs = await labApi.getSubmissions(data[0].id);
          setSubmissions(subs);
        } catch {
          setSubmissions([]);
        }
      } else {
        setSelectedLab(null);
        setCode("");
        setSubmissions([]);
      }
    } catch (error) {
      console.error("Failed to fetch labs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. 获取用户收藏的题目
  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await collectionApi.listCollections();
      setCollections(data);
      if (data.length > 0) {
        // 映射为标准 Lab 结构
        const col = data[0];
        const mappedLab = {
          id: col.id,
          title: col.title,
          description: "",
          starter_code: "",
          test_cases: col.content,
          difficulty: "medium",
          lab_type: col.exercise_type,
          detailed_explanation: col.explanation,
          node_id: col.node_id
        };
        setSelectedLab(mappedLab);
        setIsCollected(true);
      } else {
        setSelectedLab(null);
      }
    } catch (error) {
      console.error("Failed to fetch collections:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 根据当前模式与过滤加载数据
  useEffect(() => {
    if (exerciseMode === "system") {
      fetchLabs(tabMode, nodeId);
    } else if (exerciseMode === "collection") {
      fetchCollections();
    } else {
      // 针对性出题模式，重置已选题目
      setSelectedLab(null);
      setEvalResult(null);
      setCode("");
    }
  }, [exerciseMode, tabMode, nodeId, fetchLabs, fetchCollections]);

  // 兼容老数据结构
  const fullfillLabType = (lab: any) => {
    if (!lab) return null;
    return {
      ...lab,
      lab_type: lab.lab_type || "code"
    };
  };

  // 检查当前选中题目是否已收藏
  useEffect(() => {
    if (selectedLab && exerciseMode !== "collection") {
      collectionApi.checkIsCollected(selectedLab.title)
        .then((res) => setIsCollected(res.is_collected))
        .catch(() => setIsCollected(false));
    }
  }, [selectedLab, exerciseMode]);

  // 切换选中题目
  const handleSelectLab = async (lab: any) => {
    try {
      const fullLab = await labApi.getLab(lab.id);
      setSelectedLab(fullfillLabType(fullLab));
      setCode(fullLab.starter_code || "");
      setEvalResult(null);
      try {
        const subs = await labApi.getSubmissions(lab.id);
        setSubmissions(subs);
      } catch {
        setSubmissions([]);
      }
    } catch (error) {
      console.error("Failed to fetch lab:", error);
    }
  };

  const handleSelectCollection = (col: any) => {
    const mappedLab = {
      id: col.id,
      title: col.title,
      description: "",
      starter_code: "",
      test_cases: col.content,
      difficulty: "medium",
      lab_type: col.exercise_type,
      detailed_explanation: col.explanation,
      node_id: col.node_id
    };
    setSelectedLab(mappedLab);
    setIsCollected(true);
    setEvalResult(null);
  };

  // 提交代码评测 (内置代码题专用)
  const handleSubmitCode = async () => {
    if (!selectedLab || !code) return;
    setSubmitting(true);
    setEvalResult(null);
    try {
      const result = await labApi.submitLab(
        selectedLab.id,
        code,
        apiKey,
        model,
        baseUrl
      );
      setEvalResult(result);
      try {
        const subs = await labApi.getSubmissions(selectedLab.id);
        setSubmissions(subs);
      } catch {
        // ignore
      }
    } catch (error) {
      console.error("Submit failed:", error);
      setEvalResult({
        status: "error",
        score: 0,
        feedback: "提交失败，请检查 API Key 配置和网络连接",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 呼叫 AI Agent 针对性出题
  const handleGenerateExercise = async () => {
    setDynamicLoading(true);
    setSelectedLab(null);
    setEvalResult(null);
    try {
      const result = await labApi.generateLab({
        exercise_type: dynamicType,
        difficulty: dynamicDifficulty,
        node_id: nodeId || undefined,
        subject: selectedSubject !== "all" ? selectedSubject : undefined,
        api_key: apiKey,
        model: model,
        base_url: baseUrl
      });
      
      setSelectedLab(result);
      setIsCollected(false);
    } catch (error: any) {
      console.error("Generate exercise failed:", error);
      alert(error.message || "生成练习失败，请检查 API Key 设置");
    } finally {
      setDynamicLoading(false);
    }
  };

  // 联动收藏与取消收藏
  const handleToggleCollect = async () => {
    if (!selectedLab) return;
    try {
      if (isCollected) {
        // 如果是收藏夹模式，主 ID 就是收藏记录的 ID，否则需要去后端查或利用 title 匹配
        let colId = selectedLab.id;
        if (exerciseMode !== "collection") {
          const list = await collectionApi.listCollections();
          const match = list.find((c: any) => c.title === selectedLab.title);
          if (match) colId = match.id;
        }
        await collectionApi.deleteCollection(colId);
        setIsCollected(false);
        if (exerciseMode === "collection") {
          fetchCollections();
        }
      } else {
        await collectionApi.collectExercise({
          node_id: selectedLab.node_id || undefined,
          title: selectedLab.title,
          exercise_type: selectedLab.lab_type,
          content: selectedLab.test_cases,
          answer: selectedLab.answer || selectedLab.test_cases?.pairs || selectedLab.test_cases?.correct_order || selectedLab.test_cases?.blanks || {},
          explanation: selectedLab.detailed_explanation
        });
        setIsCollected(true);
      }
    } catch (error) {
      console.error("Toggle collect failed:", error);
    }
  };

  // Renderer 答题提交的回调
  const handleRendererSubmit = async (result: { score: number; passed: boolean; answers: any }) => {
    // 如果是内置 Labs，则需要提交通关数据到后端记录 submission 并联动更新点亮/熟练度
    if (exerciseMode === "system") {
      try {
        await labApi.submitLab(
          selectedLab.id,
          JSON.stringify(result.answers),
          undefined,
          undefined,
          undefined,
          result.answers
        );
      } catch (e) {
        console.error("Failed to upload submission to system:", e);
      }
    } 
    // 如果是动态生成题目，则联动 evaluate-dynamic 进行点亮
    else if (exerciseMode === "dynamic" && result.passed) {
      try {
        await fetch(`${baseUrl || "http://localhost:8000"}/api/labs/evaluate-dynamic`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            exercise: {
              title: selectedLab.title,
              description: selectedLab.description,
              starter_code: selectedLab.starter_code,
              test_cases: selectedLab.test_cases,
              lab_type: selectedLab.lab_type,
            },
            code: "",
            answers: result.answers,
            node_id: selectedLab.node_id || undefined,
            api_key: apiKey,
            model,
            base_url: baseUrl,
          }),
        });
      } catch (e) {
        console.error("Failed to submit dynamic progress:", e);
      }
    }
  };

  return (
    <UserLayout activePath="/practice">
      {/* Main Panel */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0c0f1d] flex flex-col">
        
        {/* Header with Modes */}
        <div className="p-8 pb-4 shrink-0 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">在线练习</h1>
              <p className="text-sm text-slate-500 mt-1">通过代码实操和选择题检测学习掌握程度</p>
            </div>
            
            {/* Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-150 dark:bg-slate-800 rounded-xl max-w-sm">
              <button
                onClick={() => setExerciseMode("system")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  exerciseMode === "system"
                    ? "bg-white dark:bg-slate-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                内置题库
              </button>
              <button
                onClick={() => setExerciseMode("dynamic")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  exerciseMode === "dynamic"
                    ? "bg-white dark:bg-slate-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI 针对出题
              </button>
              <button
                onClick={() => setExerciseMode("collection")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  exerciseMode === "collection"
                    ? "bg-white dark:bg-slate-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <FolderHeart className="h-3.5 w-3.5" />
                收藏夹
              </button>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex min-h-0 p-8 gap-6">

          {/* Left Panel (Interactive dynamic config OR list) */}
          <div className="w-72 shrink-0 bg-slate-50/50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-4 overflow-y-auto flex flex-col gap-4">
            
            {exerciseMode === "system" && (
              <>
                {/* 题型细分选择 */}
                <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 pb-2 mb-1">
                  {["code", "quiz", "match", "arrange", "fill"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setTabMode(type as TabMode)}
                      className={`px-2.5 py-1.5 rounded text-[10px] font-bold capitalize transition-all ${
                        tabMode === type
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <h3 className="text-xs font-bold text-slate-400 px-1">
                  当前题型题库
                </h3>
                
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : labs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">该类别暂无内置题目</p>
                ) : (
                  <div className="space-y-1.5 flex-1 overflow-y-auto">
                    {labs.map((lab) => (
                      <button
                        key={lab.id}
                        onClick={() => handleSelectLab(lab)}
                        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left text-xs transition-colors border ${
                          selectedLab?.id === lab.id
                            ? "bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-950 text-slate-850 dark:text-white shadow-sm"
                            : "bg-transparent border-transparent text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        <span className="truncate">{lab.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {exerciseMode === "collection" && (
              <>
                <h3 className="text-xs font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2 px-1">
                  我的收藏题库
                </h3>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : collections.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">收藏夹暂无题目</p>
                ) : (
                  <div className="space-y-1.5 flex-1 overflow-y-auto">
                    {collections.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => handleSelectCollection(col)}
                        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left text-xs transition-colors border ${
                          selectedLab?.id === col.id
                            ? "bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-950 text-slate-850 dark:text-white shadow-sm"
                            : "bg-transparent border-transparent text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <Star className="h-3 w-3 shrink-0 text-amber-500 fill-current" />
                        <span className="truncate">{col.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {exerciseMode === "dynamic" && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-455 border-b border-slate-100 dark:border-slate-800 pb-2 px-1 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                  AI 针对性学情出题
                </h3>

                {/* 题型选择 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400">选择练习题型</label>
                  <select
                    value={dynamicType}
                    onChange={(e) => setDynamicType(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="quiz">概念选择题 (Quiz)</option>
                    <option value="match">概念生活类比连线题 (Match)</option>
                    <option value="arrange">步骤/流程逻辑排序题 (Arrange)</option>
                    <option value="fill">概念关键字填空题 (Fill)</option>
                    <option value="code">代码实操编程题 (Code)</option>
                  </select>
                </div>

                {/* 科目选择 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400">选择出题科目</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">智能推荐 (全部)</option>
                    <option value="程序设计基础">程序设计基础</option>
                    <option value="数据结构与算法">数据结构与算法</option>
                    <option value="计算机组成原理">计算机组成原理</option>
                    <option value="操作系统">操作系统</option>
                    <option value="计算机网络">计算机网络</option>
                    <option value="数据库系统">数据库系统</option>
                  </select>
                </div>

                {/* 难度选择 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400">选择题目难度</label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                    {["easy", "medium", "hard"].map((diff) => (
                      <button
                        key={diff}
                        onClick={() => setDynamicDifficulty(diff)}
                        className={`py-1.5 rounded text-[9px] font-bold capitalize transition-all ${
                          dynamicDifficulty === diff
                            ? "bg-white dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                {nodeId && (
                  <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-xl border border-dashed border-indigo-100 dark:border-indigo-900/40 text-[10px] text-indigo-650 dark:text-indigo-400 leading-normal">
                    已选定聚焦知识节点，AI 将针对性围绕该节点及其依赖链出题。
                  </div>
                )}

                {/* 生成出题大按钮 */}
                <button
                  onClick={handleGenerateExercise}
                  disabled={dynamicLoading}
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {dynamicLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Agent 动态出题中...
                    </>
                  ) : (
                    <>
                      <Brain className="h-3.5 w-3.5" />
                      呼叫 AI Agent 出题
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Panel (Content area) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {dynamicLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-xs">AI Agent 正在根据您的学情以及知识库内容进行趣味出题...</span>
              </div>
            ) : !selectedLab ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs bg-slate-50/30 dark:bg-slate-800/10 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl">
                {exerciseMode === "dynamic" ? "请选择左侧的题型难度并呼叫 AI Agent 智能出题！" : "请从左侧选择题目"}
              </div>
            ) : selectedLab.lab_type === "code" ? (
              /* Code Mode Editor (Only for coding challenges) */
              <div className="bg-slate-50/50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6 flex flex-col gap-4 h-full">
                
                {/* Lab Info */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">{selectedLab.title}</h2>
                    {selectedLab.description && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{selectedLab.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-850 uppercase tracking-wider font-mono">
                        {selectedLab.difficulty || "medium"}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-850">
                        Code Challenge
                      </span>
                    </div>
                  </div>

                  {handleToggleCollect && exerciseMode !== "system" && (
                    <button
                      onClick={handleToggleCollect}
                      className={cn(
                        "p-2 rounded-xl border transition-all duration-200",
                        isCollected
                          ? "bg-amber-500/10 border-amber-400/30 text-amber-500"
                          : "border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <Star className={cn("h-4 w-4", isCollected && "fill-current")} />
                    </button>
                  )}
                </div>

                {/* Code Editor */}
                <div className="flex-1 min-h-[300px]">
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full h-full p-4 font-mono text-xs bg-slate-955 text-slate-100 rounded-xl border border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                    placeholder="在此编写 Python 代码..."
                    spellCheck={false}
                  />
                </div>

                {/* Submit Button */}
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-slate-400">
                    {apiKey ? "🔑 LLM API Key 已配置" : "⚠️ 请在设置中配置 API Key"}
                  </div>
                  <Button
                    onClick={handleSubmitCode}
                    disabled={submitting || !code}
                    className="text-xs bg-slate-900 dark:bg-indigo-650 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white rounded-xl px-6 h-10 font-bold shadow-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        AI 自动测试中...
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        提交评测
                      </>
                    )}
                  </Button>
                </div>

                {/* Evaluation Result */}
                {evalResult && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                        evalResult.status === "passed" ? "bg-emerald-500" :
                        evalResult.status === "partial" ? "bg-amber-500" :
                        evalResult.status === "failed" ? "bg-rose-500" : "bg-slate-500"
                      }`}>
                        {evalResult.score}
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                          评测结果: {evalResult.status === "passed" ? "全部通过" : evalResult.status === "partial" ? "部分通过" : evalResult.status === "failed" ? "未通过" : "执行错误"}
                        </h4>
                        <p className="text-[10px] text-slate-450 mt-0.5">{evalResult.feedback}</p>
                      </div>
                    </div>
                    {evalResult.evaluation_result?.issues?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-350">发现的问题:</p>
                        {evalResult.evaluation_result.issues.map((issue: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[10px] text-slate-500">
                            <X className="h-3 w-3 text-rose-450 shrink-0 mt-0.5" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {evalResult.evaluation_result?.suggestions?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-605 dark:text-slate-300">优化建议:</p>
                        {evalResult.evaluation_result.suggestions.map((sug: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[10px] text-slate-500">
                            <Check className="h-3 w-3 text-emerald-450 shrink-0 mt-0.5" />
                            <span>{sug}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Submission History */}
                {submissions.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-155 dark:border-slate-800 p-4">
                    <h4 className="text-[10px] font-bold text-slate-605 dark:text-slate-305 mb-2">历史评测记录</h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono">
                      {submissions.slice(0, 5).map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-slate-400">{new Date(sub.created_at).toLocaleString()}</span>
                          <span className={`font-semibold ${sub.status === "passed" ? "text-emerald-500" : sub.status === "failed" ? "text-rose-500" : "text-slate-400"}`}>
                            {sub.score}分 · {sub.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Other Interactive Question Types */
              <ExerciseRenderer
                lab={selectedLab}
                onSubmit={handleRendererSubmit}
                isCollected={isCollected}
                onToggleCollect={handleToggleCollect}
              />
            )}
          </div>
        </div>
      </div>
    </UserLayout>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <span className="text-xs text-gray-400">构建练习环境...</span>
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}
