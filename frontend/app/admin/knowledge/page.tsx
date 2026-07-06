"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, FileText, Globe, Lock } from "lucide-react";

export default function AdminKnowledgePage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await adminApi.listDocuments();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleToggleVisibility = async (docId: string, currentVisibility: string) => {
    const newVisibility = currentVisibility === "private" ? "shared" : "private";
    try {
      await adminApi.updateDocument(docId, { visibility: newVisibility });
      await fetchDocuments();
    } catch (error) {
      console.error("Failed to update document:", error);
      alert("更新失败");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">知识库管理</h1>
          <p className="text-xs text-slate-500 mt-1">管理全局文档与可见性设置</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">暂无文档</div>
        ) : (
          <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1f233a] text-xs text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">文档名称</th>
                  <th className="text-left px-4 py-3 font-medium">类型</th>
                  <th className="text-left px-4 py-3 font-medium">状态</th>
                  <th className="text-left px-4 py-3 font-medium">可见性</th>
                  <th className="text-left px-4 py-3 font-medium">上传时间</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 dark:border-[#1f233a]/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-xs">{doc.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{doc.file_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        doc.status === "completed"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                          : doc.status === "processing"
                          ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                          : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                      }`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 w-fit ${
                        doc.visibility === "shared"
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}>
                        {doc.visibility === "shared" ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        {doc.visibility}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleVisibility(doc.id, doc.visibility)}
                        className="text-xs px-3 py-1 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                      >
                        切换为{doc.visibility === "private" ? "共享" : "私有"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
