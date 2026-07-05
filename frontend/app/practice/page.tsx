"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Question {
  id: number;
  text: string;
  options: string[];
  answer: number; // Index of correct option
  explanation: string;
}

export default function PracticePage() {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("cognilink_token");
      if (!token) {
        router.push("/login");
      }
    }
  }, [router]);
  const [questions] = useState<Question[]>([
    {
      id: 1,
      text: "在大语言模型 RAG (检索增强生成) 系统中，切块 (Chunking) 的主要作用是什么？",
      options: [
        "优化模型的硬件算力分配，降低功耗",
        "由于大模型上下文窗口限制，防止核心上下文溢出并提高检索召回率",
        "将 PDF 文档压缩成更小的文件以便网络传输",
        "对用户的提问进行违规词敏感性审查"
      ],
      answer: 1,
      explanation: "文档切块 (Chunking) 能保证文本长度适配模型的 Token 限制。通过将大文档划分为小的语义单位，可以让向量检索更精确地召回与问题高相关的片段，避免大段无关文本干扰回答质量。"
    },
    {
      id: 2,
      text: "在 PostgreSQL 数据库中，pgvector 扩展推荐使用的主要索引类型是什么？",
      options: [
        "B-Tree 索引",
        "GIN 倒排索引",
        "HNSW (分层导航小世界) 或 IVFFlat 索引",
        "Hash 索引"
      ],
      answer: 2,
      explanation: "对于高维特征向量的近似最近邻搜索 (ANN)，pgvector 引入了 IVFFlat 和 HNSW (Hierarchical Navigable Small World) 索引类型。HNSW 提供了更高的召回率和更快的查询性能，但构建耗时相对较长。"
    },
    {
      id: 3,
      text: "在长期记忆系统 (Memory System) 中，何种技术能自动识别并消除陈旧与相冲突的历史事实？",
      options: [
        "将所有历史对话文本无限制塞入 Prompt 中",
        "基于语义相似度检索进行定期自动合并归档与覆盖写入 (Upsert)",
        "直接删除三天前的所有聊天会话",
        "屏蔽所有历史对话记录"
      ],
      answer: 1,
      explanation: "智能长期记忆管理会采用向量检索寻找语义冲突的事实（例如'我叫小明'与'我改名为小红'），检测到冲突或同类项时，通过大模型判定合并，写入最新状态并删除陈旧实体，从而降低长上下文垃圾信息干扰。"
    }
  ]);

  // 用户的回答选项 state
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const handleSelectOption = (qId: number, oIdx: number) => {
    if (isSubmitted) return;
    setAnswers({
      ...answers,
      [qId]: oIdx
    });
  };

  const handleSubmit = () => {
    if (Object.keys(answers).length < questions.length) {
      alert("请答完所有题目再提交！");
      return;
    }

    let correctCount = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.answer) {
        correctCount += 1;
      }
    });

    const finalScore = Math.round((correctCount / questions.length) * 100);
    setScore(finalScore);
    setIsSubmitted(true);
  };

  const handleRetry = () => {
    setAnswers({});
    setIsSubmitted(false);
    setScore(0);
  };

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-[#0c0f1d] text-slate-800 dark:text-slate-100 font-sans">
      
      {/* Sidebar 侧边栏 */}
      <aside className="w-72 bg-[#f9f9f9] dark:bg-[#0d0d0d] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col shrink-0">
        
        {/* Role Switcher Button */}
        <div className="px-4 pt-4 pb-0">
          <Link
            href="/admin"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 hover:bg-indigo-650 hover:text-white transition-all text-xs font-semibold text-indigo-650 dark:text-indigo-400"
          >
            <Shield className="h-4 w-4 shrink-0" />
            切换至管理后台
          </Link>
        </div>

        {/* New Chat Entrance */}
        <div className="p-4">
          <Link
            href="/chat"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <MessageSquare className="h-4 w-4 text-gray-500" />
            开始新聊天
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          <div className="px-1 py-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">系统功能</p>
          </div>
          
          <Link
            href="/knowledge"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            知识库
          </Link>
          <Link
            href="/memories"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Brain className="h-4 w-4" />
            记忆
          </Link>

          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Activity className="h-4 w-4 text-indigo-500" />
            学习画像
          </Link>
          <Link
            href="/graph"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Network className="h-4 w-4 text-purple-500" />
            知识图谱
          </Link>
          <Link
            href="/practice"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer w-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 font-semibold"
          >
            <Award className="h-4 w-4 text-emerald-500" />
            在线练习
          </Link>
          
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all cursor-pointer"
          >
            <Grid3X3 className="h-4 w-4" />
            首页
          </Link>
        </nav>

        {/* User Session Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 text-xs bg-gray-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              U
            </div>
            <div className="truncate text-gray-700 dark:text-gray-300">
              <span className="font-semibold block truncate leading-tight">
                {typeof window !== "undefined" ? localStorage.getItem("cognilink_user_nickname") || "未登录" : "加载中"}
              </span>
              <span className="text-[10px] text-gray-400 block mt-0.5 capitalize">
                {typeof window !== "undefined" ? localStorage.getItem("cognilink_user_role") || "student" : "student"}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm("确认退出登录？")) {
                localStorage.removeItem("cognilink_token");
                localStorage.removeItem("cognilink_user_id");
                localStorage.removeItem("cognilink_user_role");
                localStorage.removeItem("cognilink_user_nickname");
                router.push("/login");
              }
            }}
            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

      </aside>

      {/* Main Panel */}
      <main className="flex-1 overflow-y-auto p-8 bg-white dark:bg-[#0c0f1d] flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">在线练习测验</h1>
          <p className="text-sm text-slate-500 mt-1">系统将自动从您的知识库与近期交互主题中提炼核心考点，检测学习掌握程度。</p>
        </div>

        {/* Score Panel on submission */}
        {isSubmitted && (
          <div className="bg-indigo-650/10 border-2 border-indigo-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
                {score}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-850 dark:text-white">您的测验得分为：{score} 分</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {score === 100 ? "太棒了！完美掌握知识！" : score >= 60 ? "合格！请结合解析继续查漏补缺。" : "不及格！建议您返回聊天继续向 Assistant 提问。"}
                </p>
              </div>
            </div>
            <Button onClick={handleRetry} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-9 font-medium px-4 shrink-0">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              重新测验
            </Button>
          </div>
        )}

        {/* Question Cards List */}
        <div className="space-y-6 max-w-3xl">
          {questions.map((q, qIdx) => {
            const selectedIdx = answers[q.id];
            const isCorrect = selectedIdx === q.answer;

            return (
              <div key={q.id} className="bg-slate-50 dark:bg-[#121424] border border-slate-100 dark:border-[#1f233a] rounded-2xl p-6 shadow-sm">
                
                {/* Question Header */}
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 font-mono">
                    Q{qIdx + 1}
                  </span>
                  <h3 className="font-bold text-sm text-slate-850 dark:text-white leading-relaxed">{q.text}</h3>
                </div>

                {/* Options List */}
                <div className="mt-4 space-y-2 pl-9">
                  {q.options.map((option, oIdx) => {
                    const isSelected = selectedIdx === oIdx;
                    
                    let optionStyle = "border-transparent bg-white/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-350";
                    if (isSelected) {
                      optionStyle = "bg-indigo-500/15 border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold";
                    }

                    // On submit styling
                    if (isSubmitted) {
                      if (oIdx === q.answer) {
                        optionStyle = "bg-emerald-500/15 border-emerald-400 text-emerald-600 dark:text-emerald-400 font-semibold";
                      } else if (isSelected) {
                        optionStyle = "bg-rose-500/15 border-rose-400 text-rose-600 dark:text-rose-400 font-semibold";
                      }
                    }

                    return (
                      <button
                        key={oIdx}
                        disabled={isSubmitted}
                        onClick={() => handleSelectOption(q.id, oIdx)}
                        className={`flex items-center gap-3 w-full p-3 text-xs rounded-xl text-left border transition-all ${optionStyle}`}
                      >
                        <span className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center font-semibold text-[10px] shrink-0 font-mono">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Show explanation on submit */}
                {isSubmitted && (
                  <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800/60 pl-9 space-y-2 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 text-xs">
                      {isCorrect ? (
                        <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                          <CheckCircle className="h-4 w-4" /> 回答正确！
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-500 font-semibold">
                          <XCircle className="h-4 w-4" /> 回答错误！正确答案是：{String.fromCharCode(65 + q.answer)}
                        </span>
                      )}
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-850 flex gap-2">
                      <AlertCircle className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-slate-400 leading-normal">
                        <span className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">题目解析：</span>
                        {q.explanation}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>

        {/* Submit controls */}
        {!isSubmitted && (
          <div className="max-w-3xl flex justify-end pt-4">
            <Button 
              onClick={handleSubmit}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 h-10 font-medium"
            >
              提交答案
            </Button>
          </div>
        )}

      </main>
    </div>
  );
}
