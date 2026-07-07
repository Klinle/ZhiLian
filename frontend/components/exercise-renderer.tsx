"use client";

import React, { useState, useEffect } from "react";
import { Check, X, Sparkles, Star, Brain, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatAssistantStore } from "@/stores/chat-assistant";

interface LabData {
  id: string;
  title: string;
  description: string;
  starter_code?: string;
  test_cases: any;
  difficulty: string;
  lab_type: string;
  detailed_explanation?: string;
  node_id?: string;
}

interface ExerciseRendererProps {
  lab: LabData;
  onSubmit: (result: { score: number; passed: boolean; answers: any }) => Promise<void>;
  isSubmitting?: boolean;
  isCollected?: boolean;
  onToggleCollect?: () => Promise<void>;
}

export default function ExerciseRenderer({
  lab,
  onSubmit,
  isSubmitting = false,
  isCollected = false,
  onToggleCollect,
}: ExerciseRendererProps) {
  const { openAssistant, setTriggerMessage } = useChatAssistantStore();
  
  // 答题状态
  const [status, setStatus] = useState<"answering" | "checked">("answering");
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  
  // Quiz: 当前选择
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  
  // Match: 连线匹配状态
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({}); // leftKey -> rightValue
  
  // Arrange: 排序顺序
  const [arrangeSteps, setArrangeSteps] = useState<string[]>([]);
  const [originalIndices, setOriginalIndices] = useState<number[]>([]); // 记录当前顺序对应原 steps 的索引

  // Fill: 填空输入值
  const [fillInputs, setFillInputs] = useState<string[]>([]);

  // 重置作答状态
  useEffect(() => {
    setStatus("answering");
    setIsCorrect(false);
    setScore(0);
    setQuizAnswers({});
    setSelectedLeft(null);
    setMatches({});
    
    // 初始化排序题
    if (lab.lab_type === "arrange" && lab.test_cases?.steps) {
      const steps = [...lab.test_cases.steps];
      setArrangeSteps(steps);
      setOriginalIndices(steps.map((_, i) => i));
    }
    
    // 初始化填空题
    if (lab.lab_type === "fill" && lab.test_cases?.blanks) {
      setFillInputs(Array(lab.test_cases.blanks.length).fill(""));
    }
  }, [lab]);

  // 连线匹配点击
  const handleMatchClick = (side: "left" | "right", value: string) => {
    if (status === "checked") return;

    if (side === "left") {
      setSelectedLeft(value);
    } else if (side === "right" && selectedLeft) {
      // 建立连线匹配
      setMatches((prev) => ({
        ...prev,
        [selectedLeft]: value,
      }));
      setSelectedLeft(null);
    }
  };

  // 清除某个连线
  const handleClearMatch = (leftKey: string) => {
    if (status === "checked") return;
    setMatches((prev) => {
      const copy = { ...prev };
      delete copy[leftKey];
      return copy;
    });
  };

  // 排序上移下移
  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (status === "checked") return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === arrangeSteps.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;

    setArrangeSteps((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });

    setOriginalIndices((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  // 检查答案
  const handleCheckAnswers = async () => {
    let earnedScore = 0;
    let passed = false;

    if (lab.lab_type === "quiz") {
      const questions = lab.test_cases.questions || [];
      let correctCount = 0;
      questions.forEach((q: any) => {
        if (quizAnswers[q.id] === q.answer) {
          correctCount++;
        }
      });
      earnedScore = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
      passed = earnedScore >= 60;
    } 
    else if (lab.lab_type === "match") {
      const pairs = lab.test_cases.pairs || {};
      const totalPairs = Object.keys(pairs).length;
      let correctPairs = 0;
      
      Object.entries(pairs).forEach(([left, right]) => {
        if (matches[left] === right) {
          correctPairs++;
        }
      });
      earnedScore = totalPairs > 0 ? Math.round((correctPairs / totalPairs) * 100) : 0;
      passed = earnedScore === 100; // 连线全部正确才算通关，增强严谨性
    } 
    else if (lab.lab_type === "arrange") {
      const correctOrder = lab.test_cases.correct_order || [];
      // 对比 originalIndices 是否完全契合 correctOrder
      const isExactlyCorrect = originalIndices.length === correctOrder.length && 
        originalIndices.every((val, index) => val === correctOrder[index]);
      
      earnedScore = isExactlyCorrect ? 100 : 0;
      passed = isExactlyCorrect;
    } 
    else if (lab.lab_type === "fill") {
      const blanks = lab.test_cases.blanks || [];
      let correctBlanks = 0;
      
      blanks.forEach((correctVal: string, i: number) => {
        const userVal = (fillInputs[i] || "").trim().toLowerCase();
        if (userVal === correctVal.trim().toLowerCase()) {
          correctBlanks++;
        }
      });
      earnedScore = blanks.length > 0 ? Math.round((correctBlanks / blanks.length) * 100) : 0;
      passed = earnedScore === 100; // 填空全部填对才算通过
    }

    setScore(earnedScore);
    setIsCorrect(passed);
    setStatus("checked");

    // 触发父级回调（更新进度、点亮节点等）
    await onSubmit({
      score: earnedScore,
      passed,
      answers: {
        quizAnswers,
        matches,
        originalIndices,
        fillInputs,
      },
    });
  };

  // AI 导师讲解本题
  const handleAskAIExplanation = () => {
    // 拼装生动的讲解 Prompt 发送给 AI 导师
    let userMessage = `老师！我刚刚在做关于「${lab.title}」的练习。`;
    userMessage += `\n题型是：${
      lab.lab_type === "quiz" ? "概念选择题" : 
      lab.lab_type === "match" ? "概念生活类比连线匹配题" : 
      lab.lab_type === "arrange" ? "流程/步骤排序题" : "填空题"
    }。`;
    userMessage += `\n\n【题目描述】：\n${lab.description}`;
    
    if (lab.lab_type === "quiz") {
      const questions = lab.test_cases.questions || [];
      userMessage += `\n\n【具体题目内容】：`;
      questions.forEach((q: any) => {
        const userChoice = q.options[quizAnswers[q.id]] || "未作答";
        const correctChoice = q.options[q.answer];
        userMessage += `\n- 题目：${q.text}\n  - 我的回答：${userChoice} （状态：${quizAnswers[q.id] === q.answer ? "回答正确" : "回答错误"}）\n  - 正确答案应该是：${correctChoice}`;
      });
    } 
    else if (lab.lab_type === "match") {
      userMessage += `\n\n【匹配状态】：`;
      userMessage += `\n- 左侧概念术语：${JSON.stringify(lab.test_cases.left)}`;
      userMessage += `\n- 右侧生活类比：${JSON.stringify(lab.test_cases.right)}`;
      userMessage += `\n- 正确配对关系：${JSON.stringify(lab.test_cases.pairs)}`;
      userMessage += `\n- 我的配对回答：${JSON.stringify(matches)}`;
    } 
    else if (lab.lab_type === "arrange") {
      userMessage += `\n\n【排序结果】：`;
      userMessage += `\n- 标准步骤：${JSON.stringify(lab.test_cases.steps)}`;
      userMessage += `\n- 我的排序索引序列：${JSON.stringify(originalIndices)} （标准序列应该是：${JSON.stringify(lab.test_cases.correct_order)}）`;
    } 
    else if (lab.lab_type === "fill") {
      userMessage += `\n\n【填空详情】：`;
      userMessage += `\n- 题目挖空正文：${lab.test_cases.text}`;
      userMessage += `\n- 我的填空：${JSON.stringify(fillInputs)} （标准答案应该是：${JSON.stringify(lab.test_cases.blanks)}）`;
    }

    if (lab.detailed_explanation) {
      userMessage += `\n\n【标准标准解答】：\n${lab.detailed_explanation}`;
    }

    userMessage += `\n\n请用通俗幽默、充满生活小故事的苏格拉底式方式，帮我彻底讲解一下我这道题背后的计算机底层逻辑，并点拨一下我的思维盲区！`;
    
    // 打开助手并带入消息和焦点节点
    openAssistant(lab.node_id || undefined, lab.title);
    setTriggerMessage(userMessage);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col gap-5 transition-all duration-300">
      
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 uppercase tracking-wider font-mono">
            {lab.lab_type === "quiz" ? "Concept Quiz" : lab.lab_type === "match" ? "Interactive Match" : lab.lab_type === "arrange" ? "Logical Arrange" : "Concept Fill"}
          </span>
          <h2 className="text-base font-bold text-slate-850 dark:text-white mt-1.5">{lab.title}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-normal">{lab.description}</p>
        </div>

        {/* 收藏按钮 */}
        {onToggleCollect && (
          <button
            onClick={onToggleCollect}
            className={cn(
              "p-2 rounded-xl border transition-all duration-200",
              isCollected
                ? "bg-amber-500/10 border-amber-400/30 text-amber-500 hover:bg-amber-500/20"
                : "border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600"
            )}
            title={isCollected ? "取消收藏" : "收藏题目"}
          >
            <Star className={cn("h-4 w-4", isCollected && "fill-current")} />
          </button>
        )}
      </div>

      {/* 答题交互区 */}
      <div className="flex-1 min-h-[160px]">
        {status === "answering" ? (
          <>
            {/* 1. 单项选择题 Quiz */}
            {lab.lab_type === "quiz" && (
              <div className="space-y-5">
                {(lab.test_cases.questions || []).map((q: any, qIdx: number) => (
                  <div key={q.id} className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {qIdx + 1}. {q.text}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {q.options.map((opt: string, optIdx: number) => (
                        <button
                          key={optIdx}
                          onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                          className={cn(
                            "w-full text-left px-4 py-3 rounded-xl border text-xs transition-all duration-150",
                            quizAnswers[q.id] === optIdx
                              ? "border-indigo-500 bg-indigo-500/5 text-indigo-700 dark:text-indigo-400 font-bold"
                              : "border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300"
                          )}
                        >
                          <span className="font-mono mr-2 font-semibold">{String.fromCharCode(65 + optIdx)}.</span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 2. 连线匹配题 Match */}
            {lab.lab_type === "match" && (
              <div className="space-y-4">
                <p className="text-[10px] text-indigo-500 font-medium">提示：先点击左侧的术语，再点击右侧对应的趣味生活类比配对！</p>
                <div className="grid grid-cols-2 gap-8 relative">
                  {/* Left Column (Concepts) */}
                  <div className="space-y-2">
                    {(lab.test_cases.left || []).map((leftVal: string) => {
                      const matchedRight = matches[leftVal];
                      return (
                        <button
                          key={leftVal}
                          onClick={() => handleMatchClick("left", leftVal)}
                          className={cn(
                            "w-full text-left px-4 py-3 rounded-xl border text-xs transition-all duration-200 flex items-center justify-between",
                            selectedLeft === leftVal
                              ? "border-indigo-500 bg-indigo-500/5 text-indigo-650 dark:text-indigo-400 font-bold ring-2 ring-indigo-500/20"
                              : matchedRight
                              ? "border-emerald-200 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-medium"
                              : "border-slate-150 dark:border-slate-800 hover:bg-slate-50/40 text-slate-700 dark:text-slate-300"
                          )}
                        >
                          <span>{leftVal}</span>
                          {matchedRight && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearMatch(leftVal);
                              }}
                              className="text-[9px] text-slate-400 hover:text-red-500 font-semibold px-1 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 ml-2"
                            >
                              取消
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Column (Analogy) */}
                  <div className="space-y-2">
                    {(lab.test_cases.right || []).map((rightVal: string) => {
                      // 查找是否有配对
                      const matchedLeftKey = Object.keys(matches).find(k => matches[k] === rightVal);
                      return (
                        <button
                          key={rightVal}
                          onClick={() => handleMatchClick("right", rightVal)}
                          className={cn(
                            "w-full text-left px-4 py-3 rounded-xl border text-xs transition-all duration-250",
                            matchedLeftKey
                              ? "border-emerald-200 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-medium"
                              : selectedLeft
                              ? "border-indigo-100 dark:border-indigo-900/20 hover:border-indigo-300 text-slate-600 dark:text-slate-400 hover:bg-indigo-500/5 animate-pulse"
                              : "border-slate-150 dark:border-slate-800 hover:bg-slate-50/40 text-slate-700 dark:text-slate-300"
                          )}
                        >
                          <span>{rightVal}</span>
                          {matchedLeftKey && (
                            <span className="block text-[8px] text-slate-400 mt-0.5 truncate font-mono">
                              已匹配: {matchedLeftKey}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3. 步骤排序题 Arrange */}
            {lab.lab_type === "arrange" && (
              <div className="space-y-3">
                <p className="text-[10px] text-indigo-500 font-medium">提示：请用卡片右侧的上下箭头调整步骤顺序，重组成正确的业务逻辑链！</p>
                <div className="space-y-2">
                  {arrangeSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold font-mono flex items-center justify-center text-slate-500">
                          {idx + 1}
                        </span>
                        <span className="text-slate-700 dark:text-slate-200 font-medium">{step}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveStep(idx, "up")}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveStep(idx, "down")}
                          disabled={idx === arrangeSteps.length - 1}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. 概念填空题 Fill */}
            {lab.lab_type === "fill" && (
              <div className="space-y-4">
                <p className="text-[10px] text-indigo-500 font-medium">提示：请在下方文本空缺的输入框中，键入填空项！</p>
                <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 leading-relaxed text-slate-700 dark:text-slate-200 text-xs">
                  {(() => {
                    // 用正则匹配所有的 3 个或更多短横线下划线，切分后嵌入 <input>
                    const text = lab.test_cases.text || "";
                    const parts = text.split(/___/);
                    return parts.map((part: string, idx: number) => (
                      <React.Fragment key={idx}>
                        <span>{part}</span>
                        {idx < parts.length - 1 && (
                          <input
                            type="text"
                            value={fillInputs[idx] || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFillInputs((prev) => {
                                const copy = [...prev];
                                copy[idx] = val;
                                return copy;
                              });
                            }}
                            placeholder={`填空 ${idx + 1}`}
                            className="mx-1 px-2.5 py-1 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-indigo-650 dark:text-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 w-28 inline-block"
                          />
                        )}
                      </React.Fragment>
                    ));
                  })()}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Checked 评分与解析展示状态 */
          <div className="space-y-4">
            
            {/* 评分卡片 */}
            <div className={cn(
              "border rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-center",
              isCorrect
                ? "bg-emerald-500/5 border-emerald-200 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/5 border-red-200 text-red-600 dark:text-red-400"
            )}>
              <div className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-sm">
                {isCorrect ? (
                  <Sparkles className="h-6 w-6 text-emerald-500 animate-bounce" />
                ) : (
                  <X className="h-6 w-6 text-red-500" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold">{isCorrect ? "挑战成功！全部回答正确" : "检验未全对"}</h3>
                <p className="text-[10px] text-slate-405 dark:text-slate-500 mt-0.5">本次得分：{score} / 100 分</p>
              </div>
            </div>

            {/* 详细答案及解析 */}
            {lab.detailed_explanation && (
              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-800/80">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2">
                  <Brain className="h-4 w-4 text-indigo-500" />
                  通俗原理解析与详细标准解答
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed font-sans">
                  {lab.detailed_explanation}
                </p>
              </div>
            )}

            {/* 互动讲解控制 */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAskAIExplanation}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs hover:from-indigo-650 hover:to-purple-700 transition-all shadow-sm hover:shadow-indigo-500/10 flex items-center justify-center gap-2"
              >
                <Sparkles className="h-3.5 w-3.5" />
                呼叫 AI 导师一对一类比讲解
              </button>

              <button
                onClick={() => setStatus("answering")}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新作答
              </button>
            </div>

          </div>
        )}
      </div>

      {/* Footer Actions (Answering Mode) */}
      {status === "answering" && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-end">
          <button
            onClick={handleCheckAnswers}
            disabled={isSubmitting || (lab.lab_type === "match" && Object.keys(matches).length === 0)}
            className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white font-bold text-xs transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm flex items-center gap-1.5"
          >
            {isSubmitting ? "正在评测提交..." : "提交答题评测"}
          </button>
        </div>
      )}

    </div>
  );
}
