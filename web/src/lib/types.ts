export interface Citation {
  n: number;
  chunkId: number;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  snippet: string;
  score: number;
}

export type SourceKind = "pdf" | "youtube";

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  origin: string;
  meta: Record<string, unknown>;
  embeddingModel: string;
  dims: number;
  chunkCount: number;
  createdAt: string;
  compatible: boolean;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}

export interface LlmMode {
  provider: "openai" | "ollama" | "extractive";
  model: string;
  label: string;
  detail: string;
  note?: string;
}

export interface Health {
  ok: boolean;
  llm: LlmMode;
  embeddings: { model: string };
  stats: { sources: number };
}

export interface ChatMeta {
  userMessage: Message;
  citations: Citation[];
  provider: LlmMode;
}

export interface StreamState {
  phase: "retrieving" | "writing";
  text: string;
  citations: Citation[];
}

export interface BusyState {
  kind: "pdf" | "youtube";
  label: string;
}
