"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Sparkles, ArrowRight, Loader2, RefreshCw, CheckCircle, XCircle, Award, HelpCircle } from "lucide-react";
import { labApi } from "@/lib/api";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import type { RecommendedNode } from "@/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface RadarData {
  indicators: { name: string; max: number }[];
  values: {
    direction: string;
    coverage: number;
    proficiency: number;
    lighted: number;
    total: number;
  }[];
}

// Quiz 题目项
interface QuizQuestion {
  id?: string;
  text?: string;
  question?: string;
  options?: string[];
  answer?: number;
  explanation?: string;
}

// Quiz 数据
interface QuizData {
  id?: string;
  node_id?: string;
  node_name?: string;
  test_cases?: { questions?: QuizQuestion[] };
  questions?: QuizQuestion[];
}

// Quiz 评测结果
interface QuizEvalResult {
  score: number;
  feedback?: string;
}

interface StudyPanelProps {
  recommendedNodes: RecommendedNode[];
  radarData: RadarData | null;
  onSelectNode: (nodeId: string) => void;
  onQuizPassed?: () => void; // Quiz 回答正确后的回调，用于刷新技能树
  selectedNodeId?: string; // 当前选中的知识节点 ID，Quick Quiz 为该节点出题
}

const CATEGORY_COLORS: Record<string, string> = {
  programming: "#3b82f6",
  dsa: "#ef4444",
  organization: "#10b981",
  os: "#06b6d4",
  network: "#8b5cf6",
  database: "#f59e0b",
};

export default function StudyPanel({
  recommendedNodes,
  radarData,
  onSelectNode,
  onQuizPassed,
  selectedNodeId,
}: StudyPanelProps) {
  const [mounted, setMounted] = useState(false);
  
  // Quiz 状态
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [evalResult, setEvalResult] = useState<QuizEvalResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const { model, baseUrls, getEffectiveApiKey } = useSettingsStore();
  const apiKey = getEffectiveApiKey();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 懒加载加载第一个 Quiz，选中节点变化时重新出题
  useEffect(() => {
    if (mounted) {
      loadQuiz();
    }
  }, [mounted, selectedNodeId]);

  const loadQuiz = async () => {
    setIsLoadingQuiz(true);
    setSelectedAnswer(null);
    setEvalResult(null);
    try {
      const activeModel = SUPPORTED_MODELS.find((m) => m.id === model);
      const res = await labApi.generateLab({
        exercise_type: "quiz",
        api_key: apiKey,
        model: model,
        base_url: activeModel?.provider ? baseUrls[activeModel.provider] : undefined,
        node_id: selectedNodeId,
      });
      setQuiz(res);
    } catch (err) {
      console.error("Failed to generate targeted quiz:", err);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleAnswerClick = async (ansIndex: number) => {
    if (isEvaluating || evalResult || !quiz) return;
    setSelectedAnswer(ansIndex);
    setIsEvaluating(true);
    try {
      const activeModel = SUPPORTED_MODELS.find((m) => m.id === model);
      // 提取问题项以进行即时评测
      const questionItem: QuizQuestion = (quiz.test_cases?.questions?.[0] || quiz.questions?.[0] || quiz) as QuizQuestion;
      
      const res = await labApi.evaluateDynamic({
        exercise: quiz as Record<string, unknown>,
        answers: { [questionItem.id || "0"]: ansIndex },
        node_id: quiz.node_id,
        api_key: apiKey,
        model: model,
        base_url: activeModel?.provider ? baseUrls[activeModel.provider] : undefined,
      });
      setEvalResult(res);
      
      // 如果答对了，触发回调通知父组件点亮节点
      if (res.score >= 60 && onQuizPassed) {
        onQuizPassed();
      }
    } catch (err) {
      console.error("Failed to evaluate quiz answer:", err);
    } finally {
      setIsEvaluating(false);
    }
  };

  // 绘制迷你版雷达图的配置
  const radarOption = radarData
    ? {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          borderWidth: 0,
          textStyle: { color: "#fff", fontSize: 10 },
        },
        radar: {
          indicator: radarData.indicators.map((ind) => ({
            name: ind.name,
            max: ind.max,
          })),
          shape: "polygon",
          radius: "60%",
          axisName: {
            color: "#64748b",
            fontSize: 9,
            fontWeight: "bold",
          },
          splitArea: {
            areaStyle: {
              color: [
                "rgba(99, 102, 241, 0.01)",
                "rgba(99, 102, 241, 0.03)",
                "rgba(99, 102, 241, 0.05)",
                "rgba(99, 102, 241, 0.08)",
                "rgba(99, 102, 241, 0.12)",
              ],
            },
          },
          axisLine: { lineStyle: { color: "rgba(99, 102, 241, 0.1)" } },
          splitLine: { lineStyle: { color: "rgba(99, 102, 241, 0.08)" } },
        },
        series: [
          {
            name: "能力画像",
            type: "radar",
            data: [
              {
                value: radarData.values.map((v) => v.coverage),
                name: "知识覆盖率 (%)",
                symbol: "none",
                itemStyle: { color: "#6366f1" },
                areaStyle: { color: "rgba(99, 102, 241, 0.25)" },
                lineStyle: { width: 1.5, color: "#6366f1" },
              },
              {
                value: radarData.values.map((v) => v.proficiency),
                name: "平均熟练度 (%)",
                symbol: "none",
                itemStyle: { color: "#10b981" },
                areaStyle: { color: "rgba(16, 185, 129, 0.15)" },
                lineStyle: { width: 1.5, color: "#10b981" },
              },
            ],
          },
        ],
      }
    : null;

  // 提取 Quiz 题目详情
  const question: QuizQuestion = (quiz?.test_cases?.questions?.[0] || quiz?.questions?.[0] || quiz) as QuizQuestion;

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* 模块一：今日推荐学习路径 */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
        <h3 className="text-xs font-bold text-gray-800 dark:text-zinc-200 mb-3 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
          今日自适应推荐路径
        </h3>

        {recommendedNodes.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-gray-400 dark:text-zinc-500">太棒了！当前领域均已掌握</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recommendedNodes.slice(0, 3).map((node) => {
              const borderCol = CATEGORY_COLORS[node.category] || "#6366f1";
              return (
                <div
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className="group p-3 bg-slate-50 dark:bg-zinc-800/40 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 border border-gray-100 dark:border-zinc-800 hover:border-indigo-100 rounded-xl transition-all cursor-pointer flex justify-between items-start gap-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: borderCol }} />
                      <span className="font-bold text-xs text-gray-800 dark:text-zinc-200 truncate block">
                        {node.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                      {node.reason || node.description}
                    </p>
                  </div>
                  <button className="text-gray-400 group-hover:text-indigo-600 transition-colors p-0.5 mt-0.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 模块二：快速 Quiz 挑战 */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col min-h-[220px]">
        <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-zinc-800 pb-2">
          <h3 className="text-xs font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-purple-500" />
            快速 Quiz 实战
          </h3>
          {quiz && (
            <button
              onClick={loadQuiz}
              className="p-1 text-gray-400 hover:text-indigo-600 transition-colors hover:rotate-180 duration-500 rounded-lg cursor-pointer"
              title="刷新题目"
              disabled={isLoadingQuiz || isEvaluating}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>

        {isLoadingQuiz ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <p className="text-[10px] text-gray-400">AI 正在根据你的掌握度选题...</p>
          </div>
        ) : !quiz ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
            <p className="text-xs text-gray-400 dark:text-zinc-500">无法生成题目</p>
            <button
              onClick={loadQuiz}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 underline cursor-pointer"
            >
              重试加载
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              {/* 关联的知识节点 */}
              {quiz.node_name && (
                <span className="text-[9px] bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 font-bold px-2 py-0.5 rounded-full border border-purple-100 dark:border-purple-900 w-fit block mb-2">
                  薄弱突破: {quiz.node_name}
                </span>
              )}
              {/* 问题题干 */}
              <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 leading-normal mb-3">
                {question?.text || "请回答以下问题"}
              </p>

              {/* 选项 */}
              <div className="space-y-1.5">
                {(question?.options || []).map((optionText: string, oIdx: number) => {
                  const isSelected = selectedAnswer === oIdx;
                  const isCorrect = (evalResult?.score ?? 0) >= 60; // 评测通过分
                  
                  let optionStyle = "border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-850 cursor-pointer";
                  if (isSelected) {
                    if (isEvaluating) {
                      optionStyle = "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400 animate-pulse";
                    } else if (evalResult) {
                      optionStyle = isCorrect
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400 font-bold"
                        : "border-rose-500 bg-rose-50/50 dark:bg-rose-950/10 text-rose-700 dark:text-rose-400 font-bold";
                    } else {
                      optionStyle = "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400 font-bold";
                    }
                  } else if (evalResult && oIdx === question.answer) {
                    // 解析态显示正确答案
                    optionStyle = "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400 font-bold";
                  }

                  return (
                    <button
                      key={oIdx}
                      disabled={isEvaluating || evalResult !== null}
                      onClick={() => handleAnswerClick(oIdx)}
                      className={`w-full text-left p-2 rounded-xl text-[11px] leading-tight border transition-all flex items-start gap-2 ${optionStyle}`}
                    >
                      <span className="font-bold opacity-60 uppercase">{String.fromCharCode(65 + oIdx)}.</span>
                      <span>{optionText}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 评测结果与解析 */}
            {evalResult && (
              <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-zinc-800 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {(evalResult?.score ?? 0) >= 60 ? (
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                      <CheckCircle className="h-4 w-4" />
                      回答正确！已点亮节点
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 text-[11px] font-bold">
                      <XCircle className="h-4 w-4" />
                      回答错误，再接再厉！
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 dark:text-zinc-400 leading-relaxed bg-slate-50 dark:bg-zinc-800/40 p-2.5 rounded-xl border border-gray-100 dark:border-zinc-800">
                  <span className="font-bold text-gray-700 dark:text-zinc-300 block mb-0.5">💡 解析：</span>
                  {evalResult.feedback || "回答本题需要掌握对应的计算机核心基础原理。"}
                </p>
                <button
                  onClick={loadQuiz}
                  className="w-full mt-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-bold transition-colors cursor-pointer text-center"
                >
                  挑战下一题
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 模块三：能力雷达图 */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col h-[220px]">
        <h3 className="text-xs font-bold text-gray-800 dark:text-zinc-200 mb-2 flex items-center gap-1.5 shrink-0">
          <Award className="h-4 w-4 text-indigo-500" />
          熟练度雷达图
        </h3>
        <div className="flex-1 min-h-0 relative">
          {mounted && radarOption ? (
            <ReactECharts option={radarOption} style={{ height: "100%", width: "100%" }} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-xs">雷达图渲染中...</div>
          )}
        </div>
      </div>
    </div>
  );
}
