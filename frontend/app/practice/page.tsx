"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Brain,
  Grid3X3,
  Shield,
  Activity,
  Network,
  Award,
  CheckCircle,
  XCircle,
  AlertCircle,
  RotateCcw,
  Loader2,
  Code2,
  ListChecks,
  Send,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import { labApi, getAuthHeaders } from "@/lib/api";
import type { Lab, Submission } from "@/types";
import UserLayout from "@/components/user-layout";

type TabMode = "code" | "quiz";

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  answer: number;
  explanation: string;
}

function PracticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get("nodeId");

  const { apiKeys, openaiApiKey, model, baseUrls } = useSettingsStore();

  const [tabMode, setTabMode] = useState<TabMode>("code");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
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
        setSelectedLab(lab);
        setCode(lab.starter_code || "");
        setEvalResult(null);
        setQuizAnswers({});
        setQuizSubmitted(false);
        setQuizScore(0);
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

  useEffect(() => {
    fetchLabs(tabMode, nodeId);
  }, [tabMode, nodeId, fetchLabs]);

  const handleSelectLab = async (lab: Lab) => {
    try {
      const fullLab = await labApi.getLab(lab.id);
      setSelectedLab(fullLab);
      setCode(fullLab.starter_code || "");
      setEvalResult(null);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(0);
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

  const handleSubmitQuiz = async () => {
    if (!selectedLab) return;
    const testCases = selectedLab.test_cases as { questions: QuizQuestion[] };
    const questions = testCases?.questions || [];
    if (Object.keys(quizAnswers).length < questions.length) {
      alert("请答完所有题目再提交！");
      return;
    }
    setSubmitting(true);
    try {
      const result = await labApi.submitLab(
        selectedLab.id,
        JSON.stringify(quizAnswers),
        undefined,
        undefined,
        undefined,
        quizAnswers
      );
      setEvalResult(result);
      setQuizSubmitted(true);
      setQuizScore(result.score);
      try {
        const subs = await labApi.getSubmissions(selectedLab.id);
        setSubmissions(subs);
      } catch {
        // ignore
      }
    } catch (error) {
      console.error("Submit failed:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetQuiz = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
    setEvalResult(null);
  };

  const quizQuestions: QuizQuestion[] =
    tabMode === "quiz" && selectedLab?.test_cases
      ? (selectedLab.test_cases as { questions: QuizQuestion[] }).questions || []
      : [];

  return (
    <UserLayout activePath="/practice">
      {/* Main Panel */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0c0f1d] flex flex-col">
        {/* Header with Tabs */}
        <div className="p-8 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">在线练习</h1>
              <p className="text-sm text-slate-500 mt-1">通过代码实操和选择题检测学习掌握程度</p>
            </div>
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setTabMode("code")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                  tabMode === "code"
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                代码实操
              </button>
              <button
                onClick={() => setTabMode("quiz")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                  tabMode === "quiz"
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" />
                选择题
              </button>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-6">

          {/* Lab List Panel */}
          <div className="w-72 shrink-0 bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-4 overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-500 mb-3 px-1">
              {tabMode === "code" ? "代码实操题" : "选择题库"}
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : labs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">暂无题目</p>
            ) : (
              <div className="space-y-1.5">
                {labs.map((lab) => (
                  <button
                    key={lab.id}
                    onClick={() => handleSelectLab(lab)}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left text-xs transition-colors border ${
                      selectedLab?.id === lab.id
                        ? "bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-950 text-slate-850 dark:text-white"
                        : "bg-transparent border-transparent text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="truncate">{lab.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content Panel */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6">
            {!selectedLab ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                {loading ? "加载中..." : "请从左侧选择题目"}
              </div>
            ) : tabMode === "code" ? (
              /* Code Mode */
              <div className="flex flex-col gap-4 h-full">
                {/* Lab Info */}
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedLab.title}</h2>
                  {selectedLab.description && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{selectedLab.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                      {selectedLab.difficulty || "medium"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      代码实操
                    </span>
                  </div>
                </div>

                {/* Code Editor */}
                <div className="flex-1 min-h-0">
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full h-full min-h-[300px] p-4 font-mono text-sm bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="在此编写代码..."
                    spellCheck={false}
                  />
                </div>

                {/* Submit Button */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    {apiKey ? "API Key 已配置" : "请在设置中配置 API Key"}
                  </div>
                  <Button
                    onClick={handleSubmitCode}
                    disabled={submitting || !code}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 h-10 font-medium"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        评测中...
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
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                        evalResult.status === "passed" ? "bg-emerald-500" :
                        evalResult.status === "partial" ? "bg-amber-500" :
                        evalResult.status === "failed" ? "bg-rose-500" : "bg-slate-500"
                      }`}>
                        {evalResult.score}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          评测结果: {evalResult.status === "passed" ? "通过" : evalResult.status === "partial" ? "部分通过" : evalResult.status === "failed" ? "未通过" : "错误"}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">{evalResult.feedback}</p>
                      </div>
                    </div>
                    {evalResult.evaluation_result?.issues?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">问题:</p>
                        {evalResult.evaluation_result.issues.map((issue: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                            <AlertCircle className="h-3 w-3 text-rose-400 shrink-0 mt-0.5" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {evalResult.evaluation_result?.suggestions?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">改进建议:</p>
                        {evalResult.evaluation_result.suggestions.map((sug: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                            <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{sug}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Submission History */}
                {submissions.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">提交历史</h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {submissions.slice(0, 5).map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-slate-500">{new Date(sub.created_at).toLocaleString()}</span>
                          <span className={`font-mono ${sub.status === "passed" ? "text-emerald-500" : sub.status === "failed" ? "text-rose-500" : "text-slate-400"}`}>
                            {sub.score}分 · {sub.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Quiz Mode */
              <div className="flex flex-col gap-4">
                {/* Lab Info */}
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedLab.title}</h2>
                  {selectedLab.description && (
                    <p className="text-xs text-slate-500 mt-1">{selectedLab.description}</p>
                  )}
                </div>

                {/* Score Panel */}
                {quizSubmitted && (
                  <div className="bg-indigo-50 dark:bg-indigo-950/20 border-2 border-indigo-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
                        {quizScore}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">得分: {quizScore} 分</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {quizScore === 100 ? "完美掌握！" : quizScore >= 60 ? "合格！" : "需要继续学习"}
                        </p>
                      </div>
                    </div>
                    <Button onClick={handleResetQuiz} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-9 font-medium px-4">
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      重新答题
                    </Button>
                  </div>
                )}

                {/* Questions */}
                <div className="space-y-4">
                  {quizQuestions.map((q, qIdx) => {
                    const selectedIdx = quizAnswers[q.id];
                    const isCorrect = quizSubmitted && selectedIdx === q.answer;
                    const showCorrect = quizSubmitted && selectedIdx !== q.answer;

                    return (
                      <div key={q.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 font-mono">
                            Q{qIdx + 1}
                          </span>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-relaxed">{q.text}</h3>
                        </div>
                        <div className="mt-3 space-y-2 pl-9">
                          {q.options.map((option, oIdx) => {
                            const isSelected = selectedIdx === oIdx;
                            let style = "border-transparent bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300";
                            if (isSelected && !quizSubmitted) {
                              style = "bg-indigo-500/15 border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold";
                            }
                            if (quizSubmitted) {
                              if (oIdx === q.answer) {
                                style = "bg-emerald-500/15 border-emerald-400 text-emerald-600 dark:text-emerald-400 font-semibold";
                              } else if (isSelected) {
                                style = "bg-rose-500/15 border-rose-400 text-rose-600 dark:text-rose-400 font-semibold";
                              }
                            }
                            return (
                              <button
                                key={oIdx}
                                disabled={quizSubmitted}
                                onClick={() => !quizSubmitted && setQuizAnswers({ ...quizAnswers, [q.id]: oIdx })}
                                className={`flex items-center gap-3 w-full p-3 text-xs rounded-lg text-left border transition-all ${style}`}
                              >
                                <span className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center font-semibold text-[10px] shrink-0 font-mono">
                                  {String.fromCharCode(65 + oIdx)}
                                </span>
                                <span>{option}</span>
                              </button>
                            );
                          })}
                        </div>
                        {quizSubmitted && (
                          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 pl-9">
                            <div className="flex items-center gap-2 text-xs mb-2">
                              {isCorrect ? (
                                <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                                  <CheckCircle className="h-4 w-4" /> 回答正确
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-rose-500 font-semibold">
                                  <XCircle className="h-4 w-4" /> 正确答案: {String.fromCharCode(65 + q.answer)}
                                </span>
                              )}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex gap-2">
                              <AlertCircle className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                              <div className="text-[11px] text-slate-500 leading-normal">
                                <span className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">解析:</span>
                                {q.explanation}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Submit */}
                {!quizSubmitted && (
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSubmitQuiz}
                      disabled={submitting || Object.keys(quizAnswers).length < quizQuestions.length}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 h-10 font-medium"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          提交中...
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          提交答案
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Submission History */}
                {submissions.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">提交历史</h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {submissions.slice(0, 5).map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-slate-500">{new Date(sub.created_at).toLocaleString()}</span>
                          <span className={`font-mono ${sub.status === "passed" ? "text-emerald-500" : "text-rose-500"}`}>
                            {sub.score}分 · {sub.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
