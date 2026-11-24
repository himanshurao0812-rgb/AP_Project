export interface Citation {
  n: number;
  chunkId: number;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  snippet: string;
  score: number;
}

export interface SourceDto {
  id: string;
  kind: "pdf" | "youtube";
  title: string;
  origin: string;
  meta: Record<string, unknown>;
  embeddingModel: string;
  dims: number;
  chunkCount: number;
  createdAt: string;
  compatible: boolean;
}

export interface MessageDto {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}

export interface LlmModeDto {
  provider: "openai" | "ollama" | "extractive";
  model: string;
  label: string;
  detail: string;
  note?: string;
}
