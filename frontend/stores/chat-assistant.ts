import { create } from "zustand";

interface ChatAssistantState {
  isOpen: boolean;
  contextNodeId: string | null;
  contextNodeName: string | null;
  openAssistant: (nodeId?: string, nodeName?: string) => void;
  closeAssistant: () => void;
  clearContext: () => void;
}

export const useChatAssistantStore = create<ChatAssistantState>((set) => ({
  isOpen: false,
  contextNodeId: null,
  contextNodeName: null,
  openAssistant: (nodeId, nodeName) =>
    set({
      isOpen: true,
      contextNodeId: nodeId ?? null,
      contextNodeName: nodeName ?? null,
    }),
  closeAssistant: () => set({ isOpen: false }),
  clearContext: () => set({ contextNodeId: null, contextNodeName: null }),
}));
