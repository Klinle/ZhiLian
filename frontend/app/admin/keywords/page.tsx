"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminKeywords() {
  const [mappings, setMappings] = useState([
    { word: "gemini", synonym: "谷歌大模型, 双子座, Gemini Pro" },
    { word: "rag", synonym: "检索增强生成, 知识库检索, RAG架构" },
    { word: "数据库", synonym: "PostgreSQL, DB, 关系型数据库" }
  ]);

  const handleDelete = (word: string) => {
    setMappings(mappings.filter(m => m.word !== word));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">关键词映射</h1>
            <p className="text-sm text-slate-500 mt-1">设置同义词、近义词映射规则，增强语义检索召回率。</p>
          </div>
          <Button className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 h-9">
            <Plus className="h-4 w-4 mr-1" /> 新增映射
          </Button>
        </div>

        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                <th className="py-4 px-6">原始关键词</th>
                <th className="py-4 px-6">同义词映射</th>
                <th className="py-4 px-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-600 dark:text-slate-300">
              {mappings.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                  <td className="py-4 px-6 font-semibold text-slate-800 dark:text-white">{m.word}</td>
                  <td className="py-4 px-6 font-mono text-slate-400">{m.synonym}</td>
                  <td className="py-4 px-6 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(m.word)}
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
