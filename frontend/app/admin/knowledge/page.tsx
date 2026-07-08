"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "@/components/admin-layout";
import { adminApi, API_BASE_URL, getAuthHeaders } from "@/lib/api";
import {
  Loader2, FileText, Globe, Lock, Power, Check, X, Upload,
  Download, RotateCcw, Trash2, Eye, FileDigit, AlertCircle, FolderOpen, CheckSquare, Square,
} from "lucide-react";

// ─── 类型定义 ────────────────────────────────────────────────

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

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

interface ProcessingProgress {
  percent: number;
  current_page: number;
  total_pages: number;
  message: string;
}

interface DocumentStatus {
  id: string;
  title: string;
  status: string;
  file_type: string;
  progress?: ProcessingProgress;
}

interface DocInfo {
  total_pages?: number;
  file_size_mb?: number;
}

interface BatchProgress {
  total: number;
  current: number;
  succeeded: number;
  failed: number;
  currentFileName: string;
}

// ─── 组件 ────────────────────────────────────────────────────

export default function AdminKnowledgePage() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 上传相关
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // 处理状态轮询
  const [processingStatus, setProcessingStatus] = useState<Record<string, DocumentStatus>>({});

  // 预览模态框
  const [viewingDoc, setViewingDoc] = useState<AdminDocument | null>(null);
  const [docContent, setDocContent] = useState("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [docInfo, setDocInfo] = useState<DocInfo>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [nextStartPage, setNextStartPage] = useState<number | null>(null);
  const [pagesPerLoad] = useState(20);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const previewTokenRef = useRef(0);
  const initialAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  // ─── 数据获取 ──────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await adminApi.listDocuments();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      showToast("error", "获取文档列表失败");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 轮询处理中的文档状态
  const fetchProcessingStatus = useCallback(async (docId: string) => {
    try {
      const data = await adminApi.getDocumentStatus(docId);
      setProcessingStatus((prev) => ({ ...prev, [docId]: data }));
    } catch (error) {
      console.error("Failed to fetch processing status:", error);
    }
  }, []);

  useEffect(() => {
    const processingDocs = documents.filter((d) => d.status === "processing");
    if (processingDocs.length === 0) {
      setProcessingStatus({});
      return;
    }
    processingDocs.forEach((doc) => fetchProcessingStatus(doc.id));
    const interval = setInterval(() => {
      processingDocs.forEach((doc) => fetchProcessingStatus(doc.id));
      fetchDocuments();
    }, 2000);
    return () => clearInterval(interval);
  }, [documents, fetchDocuments, fetchProcessingStatus]);

  // ─── 上传处理 ──────────────────────────────────────────────

  // 批量上传：逐个文件串行调用上传接口，避免后端并发压力
  const processFiles = async (files: File[]) => {
    const allowedTypes = ["pdf", "docx", "txt", "md"];
    const validFiles = files.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && allowedTypes.includes(ext);
    });

    if (validFiles.length === 0) {
      showToast("error", "没有支持的文件格式（仅支持 PDF、DOCX、TXT、MD）");
      return;
    }

    const total = validFiles.length;
    let succeeded = 0;
    let failed = 0;

    setIsUploading(true);
    setBatchProgress({ total, current: 0, succeeded: 0, failed: 0, currentFileName: "" });

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setBatchProgress({ total, current: i, succeeded, failed, currentFileName: file.name });
      setUploadProgress(`正在上传 ${i + 1}/${total}: ${file.name}`);
      try {
        await adminApi.uploadDocument(file);
        succeeded++;
      } catch (error) {
        failed++;
        const errMsg = error instanceof Error ? error.message : "上传失败";
        showToast("error", `"${file.name}" 上传失败: ${errMsg}`);
      }
    }

    setBatchProgress({ total, current: total, succeeded, failed, currentFileName: "" });
    setUploadProgress("");

    if (failed === 0) {
      showToast("success", `全部 ${total} 个文件上传成功`);
    } else {
      showToast("success", `完成: ${succeeded} 成功, ${failed} 失败`);
    }

    await fetchDocuments();
    setIsUploading(false);
    setBatchProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await processFiles(files);
  };

  // ─── 文档操作 ──────────────────────────────────────────────

  const handleToggleVisibility = async (docId: string, currentVisibility: string) => {
    const newVisibility = currentVisibility === "private" ? "shared" : "private";
    setUpdatingId(docId);
    try {
      await adminApi.updateDocument(docId, { visibility: newVisibility });
      await fetchDocuments();
    } catch (error) {
      console.error("Failed to update document:", error);
      showToast("error", "更新失败");
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
      showToast("error", "更新失败");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownload = async (doc: AdminDocument) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${doc.id}/file`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.title;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast("success", `开始下载: ${doc.title}`);
      } else {
        showToast("error", "下载失败");
      }
    } catch (error) {
      console.error("Download error:", error);
      showToast("error", "下载文档失败");
    }
  };

  const handleReprocess = async (doc: AdminDocument) => {
    if (!confirm(`确定要重新处理文档 "${doc.title}" 吗？\n这将删除现有分块并重新生成向量和知识节点。`)) return;
    try {
      await adminApi.reprocessDocument(doc.id);
      showToast("success", `文档 "${doc.title}" 开始重新处理`);
      await fetchDocuments();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "重新处理失败";
      showToast("error", errMsg);
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!confirm(`确定要删除文档 "${title}" 吗？`)) return;
    try {
      await adminApi.deleteDocument(docId);
      showToast("success", "文档已删除");
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(docId); return next; });
      await fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      showToast("error", "删除文档失败");
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 个文档吗？\n此操作不可撤销，文档及其向量数据将被永久删除。`)) return;
    setIsBatchDeleting(true);
    try {
      const result = await adminApi.batchDeleteDocuments(ids);
      if (result.failed === 0) {
        showToast("success", `成功删除 ${result.succeeded} 个文档`);
      } else {
        showToast("success", `完成：${result.succeeded} 成功，${result.failed} 失败`);
      }
      setSelectedIds(new Set());
      await fetchDocuments();
    } catch (error) {
      console.error("Batch delete error:", error);
      showToast("error", "批量删除失败");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // ─── 文档预览 ──────────────────────────────────────────────

  const isPdfPreview = viewingDoc?.file_type === ".pdf";

  const handleViewDocument = async (doc: AdminDocument) => {
    previewTokenRef.current += 1;
    const token = previewTokenRef.current;
    initialAbortRef.current?.abort();
    loadMoreAbortRef.current?.abort();

    setViewingDoc(doc);
    setIsLoadingContent(true);
    setIsLoadingMore(false);
    setDocContent("");
    setDocInfo({});
    setCurrentPage(0);
    setNextStartPage(null);

    const isPDF = doc.file_type === ".pdf";

    if (isPDF) {
      try {
        const controller = new AbortController();
        initialAbortRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 20000);
        let response: Response;
        try {
          response = await fetch(`${API_BASE_URL}/api/documents/${doc.id}/preview-info`, {
            signal: controller.signal,
            headers: getAuthHeaders(),
          });
        } finally {
          window.clearTimeout(timeoutId);
        }
        if (previewTokenRef.current !== token) return;
        if (response.ok) {
          const data = await response.json();
          setDocInfo({ total_pages: data.total_pages, file_size_mb: data.file_size_mb });
          setCurrentPage(0);
          setNextStartPage(null);
        } else {
          showToast("error", "无法加载 PDF 预览信息");
          setViewingDoc(null);
        }
      } catch (error) {
        if (previewTokenRef.current !== token) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("PDF preview info error:", error);
        showToast("error", "加载 PDF 预览失败");
        setViewingDoc(null);
      } finally {
        if (previewTokenRef.current === token) setIsLoadingContent(false);
      }
      return;
    }

    // 非 PDF：加载文本内容
    try {
      const data = await adminApi.getDocumentContent(doc.id, 0, pagesPerLoad);
      if (previewTokenRef.current !== token) return;
      setDocContent(data.content);
      setDocInfo({ total_pages: data.total_pages, file_size_mb: data.file_size_mb });
      setCurrentPage(data.end_page ?? pagesPerLoad);
      setNextStartPage(typeof data.next_start_page === "number" ? data.next_start_page : null);
    } catch (error) {
      if (previewTokenRef.current !== token) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("View error:", error);
      showToast("error", "加载文档内容失败");
      setViewingDoc(null);
    } finally {
      if (previewTokenRef.current === token) setIsLoadingContent(false);
    }
  };

  const loadMorePages = useCallback(async () => {
    if (!viewingDoc || !docInfo.total_pages || isLoadingMore) return;
    if (isPdfPreview) return;
    if (currentPage >= docInfo.total_pages) return;

    const token = previewTokenRef.current;
    const startCursor = typeof nextStartPage === "number" ? nextStartPage : currentPage;
    const nextPage = startCursor + pagesPerLoad;
    setIsLoadingMore(true);

    try {
      loadMoreAbortRef.current?.abort();
      const controller = new AbortController();
      loadMoreAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      try {
        const data = await adminApi.getDocumentContent(
          viewingDoc.id, startCursor, Math.min(nextPage, docInfo.total_pages)
        );
        if (previewTokenRef.current !== token) return;
        setDocContent((prev) => prev + data.content);
        setCurrentPage(typeof data.end_page === "number" ? data.end_page : Math.min(nextPage, docInfo.total_pages));
        setNextStartPage(typeof data.next_start_page === "number" ? data.next_start_page : null);
      } finally {
        window.clearTimeout(timeoutId);
      }
    } catch (error) {
      if (previewTokenRef.current !== token) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Load more error:", error);
      showToast("error", "加载更多内容失败");
    } finally {
      if (previewTokenRef.current === token) setIsLoadingMore(false);
    }
  }, [viewingDoc, docInfo.total_pages, isLoadingMore, currentPage, nextStartPage, pagesPerLoad, isPdfPreview, showToast]);

  // 容器过短时自动加载更多
  useEffect(() => {
    if (!viewingDoc || !docInfo.total_pages || isPdfPreview) return;
    if (currentPage >= docInfo.total_pages || isLoadingContent || isLoadingMore) return;
    const container = contentContainerRef.current;
    if (!container) return;
    if (container.scrollHeight <= container.clientHeight + 8) {
      void loadMorePages();
    }
  }, [viewingDoc, docInfo.total_pages, isPdfPreview, currentPage, isLoadingContent, isLoadingMore, docContent, loadMorePages]);

  const closeViewModal = () => {
    previewTokenRef.current += 1;
    initialAbortRef.current?.abort();
    loadMoreAbortRef.current?.abort();
    setViewingDoc(null);
    setDocContent("");
    setDocInfo({});
    setCurrentPage(0);
    setNextStartPage(null);
    setIsLoadingContent(false);
    setIsLoadingMore(false);
  };

  useEffect(() => {
    return () => {
      initialAbortRef.current?.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, []);

  // ─── 统计 ──────────────────────────────────────────────────

  const stats = {
    total: documents.length,
    active: documents.filter((d) => d.is_active !== 0).length,
    processing: documents.filter((d) => d.status === "processing").length,
    failed: documents.filter((d) => d.status === "failed").length,
  };

  // ─── 渲染 ──────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Toast */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
                toast.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                  : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
              }`}
            >
              {toast.type === "success" && <Check className="h-4 w-4" />}
              {toast.type === "error" && <AlertCircle className="h-4 w-4" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          ))}
        </div>

        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">知识库管理</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">上传文档自动解析 → 分块 → 向量化 → 知识节点提取（BGE-M3 本地嵌入模型）</p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full font-mono font-medium">
            <FileText className="h-3 w-3" />
            {stats.total} 篇文档
          </span>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "文档总数", value: stats.total, icon: FileText, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
            { label: "已启用", value: stats.active, icon: Check, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
            { label: "处理中", value: stats.processing, icon: RotateCcw, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
            { label: "失败", value: stats.failed, icon: AlertCircle, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`bg-white dark:bg-[#121424] border ${item.border} rounded-xl p-4 flex items-center gap-3`}>
                <div className={`w-10 h-10 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <div className={`text-xl font-bold font-mono ${item.color}`}>{item.value}</div>
                  <div className="text-[10px] text-slate-400">{item.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 上传区域 */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.docx,.txt,.md"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          disabled={isUploading}
        />
        {/* 文件夹选择 input（webkitdirectory 非标准属性，用 spread 注入避免 TS 报错） */}
        <input
          type="file"
          ref={folderInputRef}
          className="hidden"
          multiple
          onChange={handleFileUpload}
          disabled={isUploading}
          {...({ webkitdirectory: "" } as Record<string, string>)}
        />
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            isUploading ? "cursor-not-allowed" : "cursor-pointer"
          } ${
            isDragging
              ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
              : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600"
          }`}
        >
          <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
            {isUploading ? (
              <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
            ) : (
              <Upload className="h-6 w-6 text-slate-400" />
            )}
          </div>
          {isUploading && batchProgress ? (
            <>
              <p className="font-medium text-slate-700 dark:text-slate-200">{uploadProgress}</p>
              {/* 批量上传进度条 */}
              <div className="mt-3 mx-auto max-w-xs">
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${batchProgress.total > 0 ? ((batchProgress.current + 1) / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{batchProgress.succeeded} 成功</span>
                  <span>{batchProgress.current + 1} / {batchProgress.total}</span>
                  {batchProgress.failed > 0 && <span className="text-rose-500">{batchProgress.failed} 失败</span>}
                </div>
              </div>
              <p className="text-sm text-slate-400 mt-2">请勿关闭页面</p>
            </>
          ) : isUploading ? (
            <>
              <p className="font-medium text-slate-700 dark:text-slate-200">{uploadProgress || "正在处理..."}</p>
              <p className="text-sm text-slate-400 mt-1">请勿关闭页面</p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-700 dark:text-slate-200">拖拽文件到此处，或点击上传</p>
              <p className="text-sm text-slate-400 mt-1">支持 PDF、Word、TXT、Markdown 格式 · 使用本地嵌入模型</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
              >
                <FolderOpen className="h-4 w-4" />
                选择文件夹批量导入
              </button>
            </>
          )}
        </div>

        {/* 文档列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">暂无文档，请上传知识库文档</div>
        ) : (
          <div className="bg-white dark:bg-[#121424] border border-slate-200 dark:border-[#1f233a] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1f233a] text-xs text-slate-400">
                  <th className="px-4 py-3 w-8">
                    {/* 全选复选框 */}
                    <button
                      onClick={() => {
                        if (selectedIds.size === documents.length) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(documents.map((d) => d.id)));
                        }
                      }}
                      className="text-slate-400 hover:text-indigo-500 transition-colors"
                      title={selectedIds.size === documents.length ? "取消全选" : "全选"}
                    >
                      {selectedIds.size === documents.length && documents.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-indigo-500" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium">文档名称</th>
                  <th className="text-left px-4 py-3 font-medium">类型</th>
                  <th className="text-left px-4 py-3 font-medium">处理状态</th>
                  <th className="text-left px-4 py-3 font-medium">可见性</th>
                  <th className="text-left px-4 py-3 font-medium">启用</th>
                  <th className="text-left px-4 py-3 font-medium">上传时间</th>
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                </tr>
                {/* 批量操作栏 */}
                {selectedIds.size > 0 && (
                  <tr className="bg-indigo-50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900">
                    <td colSpan={8} className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          已选中 {selectedIds.size} 个文档
                        </span>
                        <button
                          onClick={handleBatchDelete}
                          disabled={isBatchDeleting}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isBatchDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {isBatchDeleting ? "删除中..." : "批量删除"}
                        </button>
                        <button
                          onClick={() => setSelectedIds(new Set())}
                          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                        >
                          取消选择
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const isActive = doc.is_active !== 0;
                  const canPreview = doc.status === "completed";
                  const isChecked = selectedIds.has(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`border-b border-slate-100 dark:border-[#1f233a]/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                        !isActive ? "opacity-50" : ""
                      } ${isChecked ? "bg-indigo-50/40 dark:bg-indigo-950/10" : ""}`}
                    >
                      {/* 单行复选框 */}
                      <td className="px-4 py-3 w-8">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(doc.id)) next.delete(doc.id);
                              else next.add(doc.id);
                              return next;
                            });
                          }}
                          className="text-slate-300 hover:text-indigo-500 transition-colors"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-indigo-500" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-xs">{doc.title}</span>
                        </div>
                        {/* 处理进度条 */}
                        {doc.status === "processing" && processingStatus[doc.id]?.progress && (
                          <div className="mt-2">
                            <div className="flex items-center gap-2 text-xs">
                              <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                  style={{ width: `${processingStatus[doc.id].progress!.percent}%` }}
                                />
                              </div>
                              <span className="text-indigo-500 whitespace-nowrap">
                                {processingStatus[doc.id].progress!.percent}%
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              {processingStatus[doc.id].progress!.message}
                            </p>
                          </div>
                        )}
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
                          {doc.status === "completed" ? "已就绪" : doc.status === "processing" ? "处理中" : "失败"}
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                            className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                            title="下载原文件"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (canPreview) handleViewDocument(doc); }}
                            disabled={!canPreview}
                            className={`p-1.5 rounded transition-colors ${
                              canPreview ? "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30" : "text-slate-300 cursor-not-allowed"
                            }`}
                            title={canPreview ? "查看解析内容" : "文档处理中，暂不可预览"}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReprocess(doc); }}
                            disabled={doc.status === "processing"}
                            className={`p-1.5 rounded transition-colors ${
                              doc.status !== "processing" ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30" : "text-slate-300 cursor-not-allowed"
                            }`}
                            title={doc.status === "processing" ? "处理中，请等待" : "重新处理（本地嵌入模型）"}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleVisibility(doc.id, doc.visibility || "private"); }}
                            disabled={updatingId === doc.id}
                            className="text-xs px-2 py-1 rounded text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-40 transition-colors"
                          >
                            切换为{(doc.visibility === "private" ? "共享" : "私有")}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(doc.id, isActive ? 1 : 0); }}
                            disabled={updatingId === doc.id}
                            className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-40 ${
                              isActive ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30" : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            }`}
                          >
                            <Power className="h-3 w-3" />
                            {isActive ? "禁用" : "启用"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(doc.id, doc.title); }}
                            className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* 文档预览模态框 */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121424] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-slate-400" />
                <div>
                  <h2 className="font-semibold text-sm text-slate-900 dark:text-white">{viewingDoc.title}</h2>
                  <p className="text-xs text-slate-400">
                    {viewingDoc.file_type.toUpperCase()} · {new Date(viewingDoc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button onClick={closeViewModal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* File Info Bar */}
            {docInfo.total_pages && (
              <div className="flex items-center gap-4 px-6 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <FileDigit className="h-3.5 w-3.5" />共 {docInfo.total_pages} 页
                </span>
                {docInfo.file_size_mb && <span>{docInfo.file_size_mb} MB</span>}
                {!isPdfPreview && (
                  <span>已加载 {Math.min(currentPage, docInfo.total_pages)} / {docInfo.total_pages} 页</span>
                )}
                {!isPdfPreview && currentPage < docInfo.total_pages && (
                  <span className="text-amber-500">(向下滚动加载更多)</span>
                )}
              </div>
            )}

            {/* Modal Content */}
            <div
              ref={contentContainerRef}
              className="flex-1 overflow-y-auto p-6"
              onScroll={(e) => {
                const target = e.target as HTMLDivElement;
                const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
                if (nearBottom && docInfo.total_pages && !isPdfPreview && currentPage < docInfo.total_pages && !isLoadingContent && !isLoadingMore) {
                  void loadMorePages();
                }
              }}
            >
              {isLoadingContent ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
                  <p className="text-slate-400">加载文档内容...</p>
                </div>
              ) : isPdfPreview ? (
                <div className="h-full min-h-[480px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
                  <iframe
                    src={`${API_BASE_URL}/api/documents/${viewingDoc.id}/file`}
                    title={viewingDoc.title}
                    className="w-full h-full min-h-[480px]"
                  />
                </div>
              ) : (
                <div className="max-w-none">
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-x-auto text-slate-700 dark:text-slate-200">
                    {docContent}
                  </pre>
                  {docInfo.total_pages && currentPage < docInfo.total_pages && (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                          <span className="text-xs text-slate-400">加载更多内容...</span>
                        </>
                      ) : (
                        <button
                          onClick={() => void loadMorePages()}
                          className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-500"
                        >
                          加载下一批页面
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 shrink-0">
              {docInfo.total_pages && docInfo.total_pages > 1 && !isPdfPreview && (
                <span className="text-xs text-slate-400">
                  第 {Math.min(currentPage, docInfo.total_pages)} / {docInfo.total_pages} 页
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={closeViewModal}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium text-slate-600 dark:text-slate-300"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
