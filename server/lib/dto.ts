import type { MessageRow, SourceWithCount } from "../db.js";
import { embeddingModelId } from "../rag/embeddings.js";
import type { Citation, MessageDto, SourceDto } from "../types.js";

export function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function toSourceDto(row: SourceWithCount): SourceDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    origin: row.origin,
    meta: parseJson<Record<string, unknown>>(row.meta) ?? {},
    embeddingModel: row.embedding_model,
    dims: row.dims,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    compatible: row.embedding_model === embeddingModelId(),
  };
}

export function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: parseJson<Citation[]>(row.citations),
    createdAt: row.created_at,
  };
}
