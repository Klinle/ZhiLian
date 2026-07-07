export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const getAuthHeaders = (): Record<string, string> => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("cognilink_token");
    if (token) {
      return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };
    }
  }
  return {
    "Content-Type": "application/json"
  };
};

/**
 * Returns only the Authorization header (without Content-Type).
 * Use this for FormData uploads where the browser must set Content-Type
 * with the correct multipart boundary automatically.
 */
export const getAuthHeaderOnly = (): Record<string, string> => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("cognilink_token");
    if (token) {
      return { "Authorization": `Bearer ${token}` };
    }
  }
  return {};
};

export interface ChatRequest {
  message: string;
  conversationId?: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  useRag?: boolean;
  useMemory?: boolean;
  useTools?: boolean;
  useLocalEmbedding?: boolean;
  agentId?: string;
}

export const chatApi = {
  sendMessage: async (
    data: ChatRequest,
  ): Promise<ReadableStream<Uint8Array>> => {
    const response = await fetch(`${API_BASE_URL}/api/chat/rag`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        message: data.message,
        conversationId: data.conversationId,
        apiKey: data.apiKey,
        model: data.model,
        baseUrl: data.baseUrl,
        use_rag: data.useRag ?? false,
        use_memory: data.useMemory ?? false,
        use_tools: data.useTools ?? false,
        use_local_embedding: data.useLocalEmbedding ?? false,
        agentId: data.agentId,
      }),
    });

    if (!response.body) {
      throw new Error("No response body");
    }

    return response.body;
  },
};

export const labApi = {
  listLabs: async (params?: { lab_type?: string; node_id?: string; difficulty?: string }) => {
    const query = new URLSearchParams();
    if (params?.lab_type) query.append("lab_type", params.lab_type);
    if (params?.node_id) query.append("node_id", params.node_id);
    if (params?.difficulty) query.append("difficulty", params.difficulty);
    const response = await fetch(`${API_BASE_URL}/api/labs?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取实验列表失败");
    return response.json();
  },
  getLab: async (labId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/labs/${labId}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取实验详情失败");
    return response.json();
  },
  submitLab: async (labId: string, code: string, apiKey?: string, model?: string, baseUrl?: string, answers?: Record<string, number>) => {
    const response = await fetch(`${API_BASE_URL}/api/labs/${labId}/submit`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        code,
        api_key: apiKey,
        model,
        base_url: baseUrl,
        answers,
      }),
    });
    if (!response.ok) throw new Error("提交评测失败");
    return response.json();
  },
  getSubmissions: async (labId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/labs/${labId}/submissions`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取提交历史失败");
    return response.json();
  },
  generateLab: async (params: {
    exercise_type: string;
    difficulty?: string;
    node_id?: string;
    subject?: string;
    api_key?: string;
    model?: string;
    base_url?: string;
  }) => {
    // AI 动态生成针对性练习（不传 node_id 时后端自动取薄弱节点）
    const response = await fetch(`${API_BASE_URL}/api/labs/generate`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error("生成针对性练习失败");
    return response.json();
  },
  evaluateDynamic: async (params: {
    exercise: Record<string, unknown>;
    code?: string;
    answers?: Record<string, number>;
    node_id?: string;
    api_key?: string;
    model?: string;
    base_url?: string;
  }) => {
    // 动态生成练习的即时评测（不创建 submission 记录，但联动知识图谱）
    const response = await fetch(`${API_BASE_URL}/api/labs/evaluate-dynamic`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error("即时评测失败");
    return response.json();
  },
};

export const adminApi = {
  getStats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取统计数据失败");
    return response.json();
  },
  listUsers: async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取用户列表失败");
    return response.json();
  },
  updateUser: async (userId: string, data: { role?: string; nickname?: string }) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("更新用户失败");
    return response.json();
  },
  listStudents: async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/students`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取学员列表失败");
    return response.json();
  },
  getStudentProfile: async (studentId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/students/${studentId}/profile`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取学员画像失败");
    return response.json();
  },
  listDocuments: async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取文档列表失败");
    return response.json();
  },
  updateDocument: async (docId: string, data: { visibility?: string; is_active?: number }) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${docId}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("更新文档失败");
    return response.json();
  },
  listLabs: async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/labs`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取实验列表失败");
    return response.json();
  },
  createLab: async (data: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/labs`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("创建实验失败");
    return response.json();
  },
  updateLab: async (labId: string, data: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/labs/${labId}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("更新实验失败");
    return response.json();
  },
  deleteLab: async (labId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/labs/${labId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("删除实验失败");
    return response.json();
  },
  generateBatchLabs: async (params: {
    node_id: string;
    exercise_type: string;
    difficulty?: string;
    count?: number;
    api_key?: string;
    model?: string;
    base_url?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/labs/generate-batch`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error("批量生成实验失败");
    return response.json();
  },
  batchSaveLabs: async (data: { labs: any[] }) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/labs/batch-save`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("批量保存实验失败");
    return response.json();
  },
  listKnowledgeNodes: async () => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/nodes`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取知识节点列表失败");
    return response.json();
  },
  listAgents: async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/agents`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取 Agent 列表失败");
    return response.json();
  },
  createAgent: async (data: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/agents`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("创建 Agent 失败");
    return response.json();
  },
  updateAgent: async (agentId: string, data: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/agents/${agentId}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("更新 Agent 失败");
    return response.json();
  },
};

export const profileApi = {
  getStats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/profile/stats`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取学习统计失败");
    return response.json();
  },
  getRadar: async () => {
    const response = await fetch(`${API_BASE_URL}/api/profile/radar`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取能力雷达图失败");
    return response.json();
  },
};

export const knowledgeApi = {
  getGraph: async () => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/graph`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取知识图谱失败");
    return response.json();
  },
  toggleNodeLight: async (nodeId: string, light?: boolean) => {
    const params = light !== undefined ? `?light=${light}` : "";
    const response = await fetch(`${API_BASE_URL}/api/knowledge/nodes/${nodeId}/light${params}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("点亮节点失败");
    return response.json();
  },
  getNodeLabs: async (nodeId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/nodes/${nodeId}/labs`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取节点实验失败");
    return response.json();
  },
  computePageRank: async () => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/pagerank`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("计算 PageRank 失败");
    return response.json();
  },
  recommendLearningPath: async () => {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/recommend`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取学习路径推荐失败");
    return response.json();
  },
};

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "登录失败");
    }
    return response.json();
  },
  register: async (username: string, password: string, nickname?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, nickname })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "注册失败");
    }
    return response.json();
  },
  getMe: async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error("未登录或 Token 失效");
    }
    return response.json();
  }
};

export const collectionApi = {
  listCollections: async () => {
    const response = await fetch(`${API_BASE_URL}/api/collections`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("获取收藏列表失败");
    return response.json();
  },
  collectExercise: async (data: {
    node_id?: string;
    title: string;
    exercise_type: string;
    content: any;
    answer: any;
    explanation?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/api/collections`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("收藏题目失败");
    return response.json();
  },
  deleteCollection: async (collectionId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/collections/${collectionId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("取消收藏失败");
    return response.json();
  },
  checkIsCollected: async (title: string) => {
    const response = await fetch(`${API_BASE_URL}/api/collections/check?title=${encodeURIComponent(title)}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("校验收藏状态失败");
    return response.json();
  },
};
