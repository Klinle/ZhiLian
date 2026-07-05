"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminQuestions() {
  const [questions, setQuestions] = useState([
    { text: "本项目支持哪些大语言模型接入？", category: "通用常识", hits: 342 },
    { text: "如何将多页 PDF 切片为高精度的知识向量？", category: "操作指南", hits: 185 },
    { text: "知识库的数据在本地如何保障安全隐私？", category: "安全机制", hits: 96 }
  ]);

  const handleDelete = (text: string) => {
    setQuestions(questions.filter(q => q.text !== text));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">示例问题</h1>
            <p className="text-sm text-slate-500 mt-1">配置首页推荐给普通用户的引导式示例问题列表。</p>
          </div>
          <Button className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 h-9">
            <Plus className="h-4 w-4 mr-1" /> 新增问题
          </Button>
        </div>

        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                <th className="py-4 px-6">示例问题</th>
                <th className="py-4 px-6">分类标签</th>
                <th className="py-4 px-6">被点击次数</th>
                <th className="py-4 px-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-600 dark:text-slate-300">
              {questions.map((q, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                  <td className="py-4 px-6 font-semibold text-slate-850 dark:text-white">{q.text}</td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-500">
                      {q.category}
                    </span>
                  </td>
                  <td className="py-4 px-6 font-mono text-slate-400">{q.hits} 次</td>
                  <td className="py-4 px-6 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(q.text)}
                      className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-850"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
