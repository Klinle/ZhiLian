/**
 * SSE (Server-Sent Events) 解析工具
 *
 * 用于解析 /api/chat/graph 端点返回的 SSE 事件流。
 * 前端通过 fetch POST 请求获取流式响应，手动解析 SSE 格式。
 */

/** SSE 事件接口 */
export interface SSEEvent {
  event: string;
  data: any;
}

/** 工作流状态事件 */
export interface WorkflowStatusEvent {
  type: "status";
  node: string;
  label: string;
  status: "running" | "done";
  message?: string;
  data?: any;
}

/** 工作流内容事件 */
export interface WorkflowContentEvent {
  type: "content";
  text: string;
}

/** 工作流完成事件 */
export interface WorkflowDoneEvent {
  type: "done";
}

/** 工作流错误事件 */
export interface WorkflowErrorEvent {
  type: "error";
  message: string;
}

/** 工作流事件联合类型 */
export type WorkflowEvent =
  | WorkflowStatusEvent
  | WorkflowContentEvent
  | WorkflowDoneEvent
  | WorkflowErrorEvent;

/**
 * 解析 SSE 事件流
 *
 * @param response fetch 响应对象（必须包含 body 流）
 * @param onEvent 每个事件的回调函数
 */
export async function parseSSEStream(
  response: Response,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("响应体为空");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 按双换行分割完整的 SSE 事件
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;

      const lines = part.split("\n");
      let eventType = "message";
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.slice(6);
        }
      }

      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          onEvent({ event: eventType, data });
        } catch {
          // 跳过格式错误的 JSON
        }
      }
    }
  }
}
