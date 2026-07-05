"use client";

import React from "react";
import AdminLayout from "@/components/admin-layout";


export default function PipelineTasks() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">流水线任务</h1>
          <p className="text-sm text-slate-500 mt-1">查看详细的数据导入和分片索引历史任务运行记录。</p>
        </div>

        <div className="bg-white dark:bg-[#121424] rounded-xl border border-slate-100 dark:border-[#1f233a] p-8 text-center text-slate-400 text-xs shadow-sm">
          暂无运行中的异步流水线任务。您可以返回“流水线管理”手动触发索引。
        </div>
      </div>
    </AdminLayout>
  );
}
