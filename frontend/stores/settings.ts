import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
}

export const SUPPORTED_MODELS: ModelConfig[] = [
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "google",
    description: "Gemini 最新高阶推理与代理编程模型",
    contextWindow: 1000000,
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    provider: "google",
    description: "Gemini 3 系列高性价比快速模型",
    contextWindow: 1000000,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash-Lite",
    provider: "google",
    description: "高并发低成本场景的轻量模型",
    contextWindow: 1000000,
  },

  // DeepSeek V4
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    description: "DeepSeek-V4 高速低成本版，百万上下文，适合日常对话",
    contextWindow: 1000000,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "DeepSeek-V4 旗舰版，1.6万亿参数，复杂推理与 Agent 首选",
    contextWindow: 1000000,
  },

  // 智谱 - GLM
  {
    id: "glm-5",
    name: "GLM-5",
    provider: "zhipu",
    description: "智谱最新旗舰模型",
    contextWindow: 128000,
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    provider: "zhipu",
    description: "强化代码与Agent能力的生产模型",
    contextWindow: 200000,
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7-Flash",
    provider: "zhipu",
    description: "高速低成本模型",
    contextWindow: 200000,
  },
];

export const getModelsByProvider = (provider: string) =>
  SUPPORTED_MODELS.filter((m) => m.provider === provider);

export const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    keyName: "OPENAI_API_KEY",
    baseUrlPlaceholder: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    keyName: "ANTHROPIC_API_KEY",
    baseUrlPlaceholder: "https://api.anthropic.com",
  },
  {
    id: "google",
    name: "Google AI",
    keyName: "GOOGLE_API_KEY",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    keyName: "DEEPSEEK_API_KEY",
    baseUrlPlaceholder: "https://api.deepseek.com/v1",
    defaultBaseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "alibaba",
    name: "阿里云",
    keyName: "DASHSCOPE_API_KEY",
    baseUrlPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    keyName: "ZHIPU_API_KEY",
    baseUrlPlaceholder: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    keyName: "MOONSHOT_API_KEY",
    baseUrlPlaceholder: "https://api.moonshot.cn/v1",
  },
  {
    id: "cohere",
    name: "Cohere",
    keyName: "COHERE_API_KEY",
    baseUrlPlaceholder: "https://api.cohere.ai",
  },
  {
    id: "mistral",
    name: "Mistral",
    keyName: "MISTRAL_API_KEY",
    baseUrlPlaceholder: "https://api.mistral.ai",
  },
];

interface ApiKeys {
  [provider: string]: string;
}

interface SettingsStore {
  // Legacy single key (for backward compat)
  openaiApiKey: string;
  model: string;

  // New multi-provider keys
  apiKeys: ApiKeys;
  baseUrls: { [provider: string]: string };
  selectedProvider: string;

  // Feature toggles (persisted)
  useRAG: boolean;
  useMemory: boolean;
  useTools: boolean;
  useLocalEmbedding: boolean;
  useMultiAgent: boolean;

  // Actions
  setOpenaiApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setApiKey: (provider: string, key: string) => void;
  setBaseUrl: (provider: string, url: string) => void;
  setSelectedProvider: (provider: string) => void;
  setUseRAG: (value: boolean) => void;
  setUseMemory: (value: boolean) => void;
  setUseTools: (value: boolean) => void;
  setUseLocalEmbedding: (value: boolean) => void;
  setUseMultiAgent: (value: boolean) => void;
  getEffectiveApiKey: () => string;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Legacy
      openaiApiKey: "",
      model: "deepseek-v4-flash",

      // New
      apiKeys: {},
      baseUrls: {
        deepseek: "https://api.deepseek.com/v1",
      },
      selectedProvider: "deepseek",

      // Feature toggles
      useRAG: true,   // 知识库 RAG 默认开启，后续将导入六大领域知识点
      useMemory: false,
      useTools: false,
      useLocalEmbedding: false,
      useMultiAgent: false,

      setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
      setModel: (model) => set({ model }),
      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),
      setBaseUrl: (provider, url) =>
        set((state) => ({
          baseUrls: { ...state.baseUrls, [provider]: url },
        })),
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      setUseRAG: (value) => set({ useRAG: value }),
      setUseMemory: (value) => set({ useMemory: value }),
      setUseTools: (value) => set({ useTools: value }),
      setUseLocalEmbedding: (value) => set({ useLocalEmbedding: value }),
      setUseMultiAgent: (value) => set({ useMultiAgent: value }),
      getEffectiveApiKey: () => {
        const state = get();
        const provider = state.selectedProvider;
        const model = SUPPORTED_MODELS.find((m) => m.id === state.model);
        const modelProvider = model?.provider || provider;

        // Try to get key for the model's provider
        return (
          state.apiKeys[modelProvider] ||
          (modelProvider === "openai" ? state.openaiApiKey : "")
        );
      },
    }),
    {
      name: "settings-storage",
    },
  ),
);
