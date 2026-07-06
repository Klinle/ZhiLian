"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChatAssistantStore } from "@/stores/chat-assistant";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import { useChat } from "@/hooks/use-chat";
import {
  Sparkles,
  X,
  Send,
  Bot,
  Brain,
  BookOpen,
  Wrench,
  ChevronDown,
  ArrowUp,
  MessageSquare,
  Plus,
  Loader2,
  Paperclip,
  Activity,
  Network
} from "lucide-react";
import { WorkflowPanel } from "@/components/workflow-panel";

export default function FloatingChatAssistant() {
  const {
    isOpen,
    contextNodeId,
    contextNodeName,
    closeAssistant,
    clearContext
  } = useChatAssistantStore();

  const {
    useRAG,
    useMemory,
    useTools,
    useMultiAgent,
    setUseRAG,
    setUseMemory,
    setUseTools,
    setUseMultiAgent,
    model,
    setModel,
  } = useSettingsStore();

  const {
    messages,
    setMessages,
    isLoading,
    errorMessage,
    workflowSteps,
    conversations,
    currentConversationId,
    setCurrentConversationId,
    selectedAgentId,
    setSelectedAgentId,
    fetchConversations,
    createNewConversation,
    loadConversation,
    handleSend,
    handleRegenerate,
  } = useChat();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 初始化获取对话列表
  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, workflowSteps]);

  // 感知上下文节点并自动注入欢迎消息
  useEffect(() => {
    if (isOpen && contextNodeId && contextNodeName) {
      // 只有在当前消息列表为空或刚打开时，自动注入推荐引导
      if (messages.length === 0) {
        setMessages([
          {
            id: "welcome-context",
            role: "assistant",
            content: `你好！看起来你正在探索【${contextNodeName}】。需要我用生动的生活故事来给你讲讲这个概念，还是带你用代码实操一下呢？`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    }
  }, [isOpen, contextNodeId, contextNodeName]);

  // 调整输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [input]);

  const onSend = async (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || isLoading) return;
    setInput("");
    
    // 如果是引导消息，先清空临时欢迎语
    if (messages.length === 1 && messages[0].id === "welcome-context") {
      setMessages([]);
    }
    
    await handleSend(messageText, contextNodeId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const startNewChat = async () => {
    await createNewConversation("新会话");
    clearContext();
  };

  // 渲染流式消息的类比高亮
  const renderMessageContent = (content: string) => {
    if (content.includes("💡 类比：")) {
      const parts = content.split("💡 类比：");
      const before = parts[0];
      const rest = parts[1];
      const lineBreakIdx = rest.indexOf("\n\n");
      const analogyText = lineBreakIdx !== -1 ? rest.substring(0, lineBreakIdx) : rest;
      const after = lineBreakIdx !== -1 ? rest.substring(lineBreakIdx) : "";
      
      return (
        <div className="space-y-2 whitespace-pre-wrap text-sm leading-relaxed">
          {before && <div>{before}</div>}
          <div className="bg-amber-50/80 dark:bg-amber-950/20 border-l-4 border-amber-500 text-amber-900 dark:text-amber-300 p-3.5 rounded-r-xl my-2 text-xs font-medium shadow-sm">
            <span className="font-bold block mb-1 text-amber-800 dark:text-amber-400">💡 通俗类比：</span>
            {analogyText.trim()}
          </div>
          {after && <div>{after}</div>}
        </div>
      );
    }
    return <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>;
  };

  if (!isOpen) {
    // 收起形态：右下角极光悬浮球
    return (
      <button
        onClick={() => useChatAssistantStore.getState().openAssistant()}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white flex items-center justify-center shadow-lg shadow-indigo-300 dark:shadow-none hover:shadow-xl hover:scale-105 transition-all z-50 animate-pulse cursor-pointer group"
        title="召唤 AI 导师"
      >
        <Sparkles className="h-6 w-6 group-hover:rotate-12 transition-transform" />
      </button>
    );
  }

  // 导师风格映射
  const agentDisplayNames: Record<string, string> = {
    auto: "自动导师",
    story_mentor: "故事家导师",
    practice_mentor: "实操官导师",
    quiz_mentor: "答疑官导师",
  };

  return (
    <div className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden z-50 transition-all duration-300 animate-in fade-in slide-in-from-bottom-6">
      {/* 头部 */}
      <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm leading-none flex items-center gap-1.5">
              CogniLink AI 导师
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-indigo-200" />}
            </h3>
            {contextNodeName ? (
              <span className="text-[10px] text-indigo-100 mt-1 block font-medium bg-white/10 px-2 py-0.5 rounded-full w-fit">
                正在探讨: {contextNodeName}
              </span>
            ) : (
              <span className="text-[10px] text-indigo-200 mt-0.5 block">随时解答你的计算机知识疑惑</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showHistory ? "bg-white/20" : "hover:bg-white/10"
            }`}
            title="历史记录"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            onClick={startNewChat}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="新对话"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={closeAssistant}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="收起"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 侧边历史记录列表 */}
      {showHistory && (
        <div className="absolute top-16 left-0 right-0 bottom-0 bg-white dark:bg-zinc-900 z-10 border-b border-gray-200 dark:border-zinc-800 flex flex-col animate-in fade-in duration-200">
          <div className="p-3 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50 dark:bg-zinc-900/50">
            <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">历史对话</span>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer"
            >
              返回对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">暂无历史对话</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    loadConversation(conv.id);
                    setShowHistory(false);
                    clearContext();
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-2.5 ${
                    currentConversationId === conv.id
                      ? "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900"
                      : "hover:bg-slate-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
                  <div className="truncate">
                    <span className="font-semibold block truncate leading-tight">{conv.title}</span>
                    <span className="text-[10px] text-gray-400 block mt-1">
                      {conv.message_count || 0} 条消息 · {new Date(conv.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 控制面板（导师选择与特性开关） */}
      <div className="p-2 border-b border-gray-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/20 flex items-center justify-between gap-1.5 flex-wrap">
        {/* 导师切换 */}
        <div className="relative group shrink-0">
          <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700/80 cursor-pointer">
            {agentDisplayNames[selectedAgentId] || "自动导师"}
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <div className="absolute top-full left-0 mt-1 w-36 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl py-1 hidden group-hover:block z-20">
            {Object.entries(agentDisplayNames).map(([id, name]) => (
              <button
                key={id}
                onClick={() => setSelectedAgentId(id)}
                className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-zinc-700 cursor-pointer ${
                  selectedAgentId === id ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/10 font-bold" : "text-gray-600 dark:text-zinc-400"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* 特性开关 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setUseRAG(!useRAG)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              useRAG
                ? "bg-blue-50/80 border-blue-200 text-blue-600 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400"
                : "border-gray-200 text-gray-400 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-500"
            }`}
            title={`知识库 RAG: ${useRAG ? "开启" : "关闭"}`}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setUseMemory(!useMemory)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              useMemory
                ? "bg-purple-50/80 border-purple-200 text-purple-600 dark:bg-purple-950/20 dark:border-purple-900 dark:text-purple-400"
                : "border-gray-200 text-gray-400 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-500"
            }`}
            title={`长期记忆: ${useMemory ? "开启" : "关闭"}`}
          >
            <Brain className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setUseTools(!useTools)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              useTools
                ? "bg-amber-50/80 border-amber-200 text-amber-600 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
                : "border-gray-200 text-gray-400 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-500"
            }`}
            title={`工具调用: ${useTools ? "开启" : "关闭"}`}
          >
            <Wrench className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setUseMultiAgent(!useMultiAgent)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              useMultiAgent
                ? "bg-indigo-50/80 border-indigo-200 text-indigo-600 dark:bg-indigo-950/20 dark:border-indigo-900 dark:text-indigo-400"
                : "border-gray-200 text-gray-400 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-500"
            }`}
            title={`多 Agent 协同: ${useMultiAgent ? "开启" : "关闭"}`}
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-zinc-900/10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">随时向你的专属导师提问</p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 max-w-[240px]">
                可以问我计算机网络、操作系统、数据结构等任何问题，我会用有趣的类比讲给你听！
              </p>
            </div>
            {/* 快速快捷提问项 */}
            <div className="w-full space-y-1.5 pt-2">
              <button
                onClick={() => onSend("请给我用通俗的故事讲讲[栈]和[队列]的区别")}
                className="w-full text-left p-2 bg-white dark:bg-zinc-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 border border-gray-100 dark:border-zinc-700 rounded-xl text-[10px] font-medium text-gray-600 dark:text-zinc-400 truncate cursor-pointer transition-colors block"
              >
                💡 讲讲[栈]和[队列]的区别
              </button>
              <button
                onClick={() => onSend("帮我用生活故事类比一下什么是 RAG 混合检索")}
                className="w-full text-left p-2 bg-white dark:bg-zinc-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 border border-gray-100 dark:border-zinc-700 rounded-xl text-[10px] font-medium text-gray-600 dark:text-zinc-400 truncate cursor-pointer transition-colors block"
              >
                💡 生活故事类比什么是 RAG 混合检索
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] p-3 rounded-2xl shadow-sm ${
                    isUser
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 text-gray-800 dark:text-zinc-200 rounded-tl-none"
                  }`}
                >
                  {isUser ? (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  ) : (
                    renderMessageContent(msg.content)
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* 多 Agent 协同流式步骤展示 */}
        {useMultiAgent && workflowSteps.length > 0 && (
          <div className="border border-gray-200 dark:border-zinc-800 rounded-xl p-3 bg-white dark:bg-zinc-900 shadow-sm animate-in fade-in duration-200">
            <h4 className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-1">
              <Network className="h-3 w-3 animate-spin" />
              多 Agent 协同流程监控
            </h4>
            <WorkflowPanel steps={workflowSteps} />
          </div>
        )}

        {/* 错误展示 */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 rounded-xl text-xs">
            {errorMessage}
            <button
              onClick={handleRegenerate}
              className="block mt-1 font-semibold text-indigo-600 dark:text-indigo-400 underline cursor-pointer"
            >
              重新生成回复
            </button>
          </div>
        )}

        {/* 自动滚动锚点 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="p-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        {/* 上下文聚焦快捷引导按钮 */}
        {contextNodeId && contextNodeName && messages.length === 1 && messages[0].id === "welcome-context" && (
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => onSend(`请用通俗的故事类比帮我解释一下什么是${contextNodeName}`)}
              className="flex-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-bold text-center border border-indigo-100 dark:border-indigo-900 cursor-pointer transition-colors"
            >
              📖 生活故事类比
            </button>
            <button
              onClick={() => onSend(`带我用代码实操一下${contextNodeName}的相关逻辑`)}
              className="flex-1 py-1.5 px-2 bg-purple-50 hover:bg-purple-100/80 dark:bg-purple-950/20 dark:hover:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-lg text-[10px] font-bold text-center border border-purple-100 dark:border-purple-900 cursor-pointer transition-colors"
            >
              💻 代码实操演示
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-1.5 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1.5">
          <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors text-gray-400">
            <Paperclip className="h-4 w-4" />
          </button>
          
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="向 AI 导师发送消息..."
            className="flex-1 bg-transparent border-0 outline-none text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 resize-none py-1.5 max-h-[120px] focus:ring-0 focus:outline-none"
            disabled={isLoading}
          />
          
          <button
            onClick={() => onSend()}
            disabled={!input.trim() || isLoading}
            className={`p-2 rounded-lg transition-all ${
              input.trim() && !isLoading
                ? "bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                : "bg-gray-200 text-gray-400 dark:bg-zinc-700 dark:text-zinc-600"
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
