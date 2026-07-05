"use client";

import React, { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Upload, FileText, Trash2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminKnowledge() {
  const [docs, setDocs] = useState([
    { name: "2026年Q2财报分析.pdf", size: "4.8 MB", chunks: 124, status: "已完成" },
    { name: "机器学习基础讲义.docx", size: "12.4 MB", chunks: 312, status: "已完成" },
    { name: "日常工作汇报.xlsx", size: "854 KB", chunks: 45, status: "已完成" },
  ]);

  const handleDelete = (name: string) => {
    if (confirm(`确定要删除知识库文档 ${name} 吗？`)) {
      setDocs(docs.filter(d => d.name !== name));
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">知识库管理</h1>
          <p className="text-sm text-slate-500 mt-1">上传本地文档并处理切片，构建 RAG 专属智能知识库。</p>
        </div>

        {/* Upload Zone */}
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 bg-white dark:bg-[#121424] flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-4">
            <Upload className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-slate-800 dark:text-white text-sm">拖拽文件到此处，或点击上传</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">支持 PDF, Word, Excel, TXT 格式，单个文件最大 50MB</p>
          <Button className="mt-4 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 h-9">
            选择文件
          </Button>
        </div>

        {/* Knowledge Base List */}
        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-[#1f233a] flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-500" />
              已入库文档
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">共 {docs.length} 个文档</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                  <th className="py-4 px-6">文档名称</th>
                  <th className="py-4 px-6">大小</th>
                  <th className="py-4 px-6">向量分片数</th>
                  <th className="py-4 px-6">状态</th>
                  <th className="py-4 px-6 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                {docs.map((doc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-white text-sm">{doc.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-mono text-slate-400">{doc.size}</td>
                    <td className="py-4 px-6 font-mono text-slate-400">{doc.chunks} 片</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                        {doc.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(doc.name)}
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
      </div>
    </AdminLayout>
  );
}
