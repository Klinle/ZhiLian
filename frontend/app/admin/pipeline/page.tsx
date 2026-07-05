"use client";

import React from "react";
import AdminLayout from "@/components/admin-layout";
import { GitBranch, Cpu, Play, Settings, Database, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminPipeline() {
  const steps = [
    { title: "文档接入", desc: "读取本地文件 (PDF/Word/Excel) 或网页 URL 数据流。", icon: Database, status: "active" },
    { title: "预处理与解析", desc: "采用 PyMuPDF / Unstructured 清理无效字符、提取正文段落与表格。", icon: Cpu, status: "active" },
    { title: "语义切块", desc: "基于 Token 限制及滑动窗口计算，生成重叠度合理的语义切块 (Chunk)。", icon: GitBranch, status: "active" },
    { title: "向量Embedding", desc: "调用 LiteLLM OpenAI-Embedding 生成 1536 维特征向量。", icon: Activity, status: "active" },
    { title: "存入 pgvector", desc: "使用 asyncpg 批量写入 PostgreSQL 数据库，并更新 HNSW 索引。", icon: Database, status: "active" }
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">数据通道与流水线管理</h1>
            <p className="text-sm text-slate-500 mt-1">可视化知识库 RAG 流水线运行配置。控制文档解析、切块、向量化索引的管道参数。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2b2f4f] hover:bg-slate-50 dark:hover:bg-slate-800 h-9 rounded-lg">
              <Settings className="h-4 w-4 mr-1.5" />
              配置全局参数
            </Button>
            <Button size="sm" className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-9 rounded-lg px-4">
              <Play className="h-4 w-4 mr-1.5" />
              立即触发全量索引
            </Button>
          </div>
        </div>

        {/* Pipeline Graph Visual */}
        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] p-6 shadow-sm overflow-hidden">
          <h3 className="font-bold text-sm text-slate-800 dark:text-white mb-6">当前 RAG 索引流水线工作流 (Data Pipeline)</h3>
          
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative">
            
            {/* Draw connector lines for larger screens */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-indigo-500/20 -translate-y-1/2 hidden lg:block z-0"></div>

            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="flex flex-col items-center text-center max-w-[200px] z-10 relative">
                  <div className="w-12 h-12 rounded-full bg-indigo-600/10 border-2 border-indigo-500 text-indigo-500 flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-500/10 bg-white dark:bg-[#121424]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-slate-850 dark:text-white text-xs mt-3">{step.title}</h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
