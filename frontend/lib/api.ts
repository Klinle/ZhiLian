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

export interface ChatRequest {
  message: string;
  conversationId?: string;
  apiKey: string;
  model: string;
}

export const chatApi = {
  sendMessage: async (
    data: ChatRequest,
  ): Promise<ReadableStream<Uint8Array>> => {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.body) {
      throw new Error("No response body");
    }

    return response.body;
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
