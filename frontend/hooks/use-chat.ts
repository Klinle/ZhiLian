"use client";

import { useState } from "react";
import { Message } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { useSettingsStore, SUPPORTED_MODELS } from "@/stores/settings";
import { API_BASE_URL, getAuthHeaders } from "@/lib/api";
import { parseSSEStream } from "@/lib/sse";
import { WorkflowStep } from "@/components/workflow-panel";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("auto");

  const {
    model,
    setModel,
    setSelectedProvider,
    getEffectiveApiKey,
    baseUrls,
    useRAG,
    useMemory,
    useTools,
    useLocalEmbedding,
    useMultiAgent,
  } = useSettingsStore();

  const apiKey = getEffectiveApiKey();
  const currentModel = SUPPORTED_MODELS.find((m) => m.id === model);

  // 加载对话列表
  const fetchConversations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
        setFilteredConversations(data);
        return data;
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    }
  };

  const createNewConversation = async (initialTitle = "新对话") => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: initialTitle, model }),
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(data.id);
        setMessages([]);
        await fetchConversations();
        return data.id;
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
    return null;
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/${conversationId}`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        setCurrentConversationId(data.id);
        setMessages(
          data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          }))
        );
        const convModel = SUPPORTED_MODELS.find((m) => m.id === data.model);
        if (convModel) {
          setModel(data.model);
          setSelectedProvider(convModel.provider);
        }
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleSearchConversations = async (query: string) => {
    if (!query.trim()) {
      setFilteredConversations(conversations);
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      params.append("q", query);
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/search?${params.toString()}`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        setFilteredConversations(data);
      }
    } catch (error) {
      console.error("Failed to search conversations:", error);
      const filtered = conversations.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredConversations(filtered);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSend = async (text: string, customContextNodeId?: string | null) => {
    const trimmedInput = text.trim();
    if (!trimmedInput || isLoading) return;
    setErrorMessage(null);

    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createNewConversation(trimmedInput.slice(0, 20) + "...");
      if (!conversationId) return;
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: trimmedInput,
      createdAt: new Date().toISOString(),
    };

    // 先追加用户消息，然后把输入置空
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const endpoint = useMultiAgent ? "/api/chat/graph" : "/api/chat/rag";
      const MAX_HISTORY_MESSAGES = 100;
      const historyMessages = messages
        .slice(-MAX_HISTORY_MESSAGES)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const requestBody = {
        message: userMessage.content,
        history: historyMessages,
        conversationId,
        apiKey,
        model,
        baseUrl: currentModel?.provider
          ? baseUrls[currentModel.provider]
          : undefined,
        use_rag: useRAG,
        use_memory: useMemory,
        use_tools: useTools,
        use_local_embedding: useLocalEmbedding,
        agentId: selectedAgentId !== "auto" ? selectedAgentId : undefined,
        context_node_id: customContextNodeId || undefined
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errMsg = `请求失败 (${response.status})`;
        try {
          const errData = await response.json();
          errMsg = errData.detail || errData.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      if (!response.body) throw new Error("No response body");

      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (useMultiAgent) {
        setWorkflowSteps([]);
        await parseSSEStream(response, ({ event, data }) => {
          if (event === "status") {
            setWorkflowSteps((prev) => {
              if (data.status === "running") {
                return [
                  ...prev,
                  {
                    node: data.node,
                    label: data.label,
                    status: "running" as const,
                    message: data.message,
                  },
                ];
              } else {
                const newSteps = [...prev];
                for (let i = newSteps.length - 1; i >= 0; i--) {
                  if (newSteps[i].node === data.node) {
                    newSteps[i] = {
                      ...newSteps[i],
                      status: "done" as const,
                      data: data.data,
                    };
                    break;
                  }
                }
                return newSteps;
              }
            });
          } else if (event === "content") {
            assistantMessage.content += data.text;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: assistantMessage.content }
                  : msg
              )
            );
          } else if (event === "error") {
            setErrorMessage(data.message || "多Agent工作流执行失败");
          }
        });
        setWorkflowSteps([]);
      } else {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);

          if (chunk.startsWith("[ERROR]") || (assistantMessage.content === "" && chunk.includes("[ERROR]"))) {
            const errText = (assistantMessage.content + chunk).replace("[ERROR]", "").trim();
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id));
            throw new Error(errText || "LLM 调用失败");
          }

          assistantMessage.content += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id
                ? { ...msg, content: assistantMessage.content }
                : msg
            )
          );
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const msg = error instanceof Error ? error.message : "发送消息失败";
      setErrorMessage(`${msg}，请检查 API 密钥设置`);
    } finally {
      setIsLoading(false);
      fetchConversations();
    }
  };

  const handleRegenerate = async () => {
    const lastUserIndex = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIndex === -1) return;
    const lastUserMsg = messages[messages.length - 1 - lastUserIndex];

    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      setMessages((prev) => prev.slice(0, -1));
    }
    await handleSend(lastUserMsg.content);
  };

  const handleCopyMessage = async (content: string, messageId: string, setCopiedId: (id: string | null) => void) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return {
    messages,
    setMessages,
    isLoading,
    errorMessage,
    setErrorMessage,
    workflowSteps,
    conversations,
    filteredConversations,
    setFilteredConversations,
    searchQuery,
    setSearchQuery,
    isSearching,
    currentConversationId,
    setCurrentConversationId,
    selectedAgentId,
    setSelectedAgentId,
    fetchConversations,
    createNewConversation,
    loadConversation,
    handleSearchConversations,
    handleSend,
    handleRegenerate,
    handleCopyMessage,
  };
}
