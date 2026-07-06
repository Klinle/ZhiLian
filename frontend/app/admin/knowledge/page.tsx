"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi } from "@/lib/api";
import { Loader2, FileText, Globe, Lock, Power, Check, X } from "lucide-react";

interface AdminDocument {
  id: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
  owner_id?: string | null;
  visibility?: string;
  is_active?: number;
}

export default function AdminKnowledgePage() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    setUpdatingId(docId);
    try {
      await adminApi.updateDocument(docId, { visibility: newVisibility });
      await fetchDocuments();
    } catch (error) {
      console.error("Failed to update document:", error);
      alert("更新失败");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (docId: string, currentActive: number) => {
    const newActive = currentActive === 1 ? 0 : 1;
    setUpdatingId(docId);
    try {
      await adminApi.updateDocument(docId, { is_active: newActive });
      await fetchDocuments();
    } catch (error) {
      console.error("Failed to update document:", error);
      alert("更新失败");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">知识库管理</h1>
          <p className="text-xs text-slate-500 mt-1">管理全局文档的可见性、启用状态</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>启用：用户可见，参与 RAG 检索</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>禁用：用户不可见，不参与检索</span>
          </div>
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
                  <th className="text-left px-4 py-3 font-medium">处理状态</th>
                  <th className="text-left px-4 py-3 font-medium">可见性</th>
                  <th className="text-left px-4 py-3 font-medium">启用状态</th>
                  <th className="text-left px-4 py-3 font-medium">上传时间</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const isActive = doc.is_active !== 0;
                  return (
                    <tr
                      key={doc.id}
                      className={`border-b border-slate-100 dark:border-[#1f233a]/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                        !isActive ? "opacity-50" : ""
                      }`}
                    >
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
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 w-fit ${
                          isActive
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                        }`}>
                          {isActive ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {isActive ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleVisibility(doc.id, doc.visibility || "private")}
                            disabled={updatingId === doc.id}
                            className="text-xs px-3 py-1 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-40 transition-colors"
                          >
                            切换为{(doc.visibility === "private" ? "共享" : "私有")}
                          </button>
                          <button
                            onClick={() => handleToggleActive(doc.id, isActive ? 1 : 0)}
                            disabled={updatingId === doc.id}
                            className={`text-xs px-3 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-40 ${
                              isActive
                                ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            }`}
                          >
                            <Power className="h-3 w-3" />
                            {isActive ? "禁用" : "启用"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
