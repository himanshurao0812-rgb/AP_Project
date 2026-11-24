import type { ChatMeta, Health, Message, Source } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = response.statusText || "Request failed";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep the status text
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getHealth(): Promise<Health> {
  return request<Health>("/api/health");
}

export async function getSources(): Promise<Source[]> {
  const data = await request<{ sources: Source[] }>("/api/sources");
  return data.sources;
}

export async function getMessages(sourceId: string): Promise<Message[]> {
  const data = await request<{ messages: Message[] }>(`/api/sources/${sourceId}/messages`);
  return data.messages;
}

export async function uploadPdf(file: File): Promise<Source> {
  const body = new FormData();
  body.append("file", file);
  const data = await request<{ source: Source }>("/api/sources/pdf", { method: "POST", body });
  return data.source;
}

export async function addYouTube(url: string): Promise<Source> {
  const data = await request<{ source: Source }>("/api/sources/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return data.source;
}

export function deleteSource(sourceId: string): Promise<void> {
  return request<void>(`/api/sources/${sourceId}`, { method: "DELETE" });
}

export function clearMessages(sourceId: string): Promise<void> {
  return request<void>(`/api/sources/${sourceId}/messages`, { method: "DELETE" });
}

export interface ChatHandlers {
  onMeta?: (meta: ChatMeta) => void;
  onToken?: (text: string) => void;
  onDone?: (message: Message) => void;
  onError?: (message: string) => void;
}

/**
 * POSTs a question and consumes the server-sent event stream.
 * Events: meta (citations + provider), token, done, error.
 */
export async function streamChat(
  sourceId: string,
  question: string,
  handlers: ChatHandlers,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/sources/${sourceId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = response.statusText || "Could not start the conversation";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (event: string, data: string) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (event === "meta") handlers.onMeta?.(payload as ChatMeta);
    else if (event === "token") handlers.onToken?.((payload as { text: string }).text ?? "");
    else if (event === "done") handlers.onDone?.((payload as { message: Message }).message);
    else if (event === "error") handlers.onError?.((payload as { message: string }).message);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) dispatch(event, dataLines.join("\n"));

      boundary = buffer.indexOf("\n\n");
    }
  }
}
