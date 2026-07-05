"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminSensitive() {
  const [words, setWords] = useState([
    { word: "涉密文件", category: "合规风险", replacement: "***" },
    { word: "特洛伊木马", category: "安全威胁", replacement: "[安全拦截]" }
  ]);

  const handleDelete = (word: string) => {
    setWords(words.filter(w => w.word !== word));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">敏感词库</h1>
            <p className="text-sm text-slate-500 mt-1">设置大模型输入输出审计与敏感词脱敏规则，确保系统安全合规。</p>
          </div>
          <Button className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 h-9">
            <Plus className="h-4 w-4 mr-1" /> 新增敏感词
          </Button>
        </div>

        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                <th className="py-4 px-6">阻断词</th>
                <th className="py-4 px-6">风险分类</th>
                <th className="py-4 px-6">脱敏处理</th>
                <th className="py-4 px-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-600 dark:text-slate-300">
              {words.map((w, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                  <td className="py-4 px-6 font-semibold text-slate-850 dark:text-white">{w.word}</td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-rose-500">
                      {w.category}
                    </span>
                  </td>
                  <td className="py-4 px-6 font-mono text-slate-400">{w.replacement}</td>
                  <td className="py-4 px-6 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(w.word)}
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
