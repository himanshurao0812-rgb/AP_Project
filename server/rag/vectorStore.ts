import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { getChunks, getSource, insertChunkStmt, db } from "../db.js";
import { EmbeddingMismatchError } from "../lib/errors.js";
import { embeddingModelId, getEmbeddings } from "./embeddings.js";

interface IndexedChunk {
  id: number;
  idx: number;
  content: string;
  page: number | null;
  startSec: number | null;
  endSec: number | null;
  vector: Float32Array;
}

interface SourceIndex {
  dims: number;
  model: string;
  chunks: IndexedChunk[];
}

const cache = new Map<string, SourceIndex>();

export function invalidateSourceIndex(sourceId: string): void {
  cache.delete(sourceId);
}

function toFloat32(buffer: Buffer): Float32Array {
  const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(copy);
}

function loadIndex(sourceId: string): SourceIndex {
  const cached = cache.get(sourceId);
  if (cached) return cached;

  const source = getSource(sourceId);
  if (!source) throw new Error("Source not found");

  const model = embeddingModelId();
  if (source.embedding_model !== model) {
    throw new EmbeddingMismatchError(
      `This source was indexed with "${source.embedding_model}", but the server is now using "${model}". Re-upload the source to chat with it.`,
    );
  }

  const chunks: IndexedChunk[] = getChunks(sourceId).map((row) => ({
    id: row.id,
    idx: row.idx,
    content: row.content,
    page: row.page,
    startSec: row.start_sec,
    endSec: row.end_sec,
    vector: toFloat32(row.embedding),
  }));

  const index: SourceIndex = { dims: source.dims, model, chunks };
  cache.set(sourceId, index);
  return index;
}

function dot(a: number[] | Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) sum += a[i] * b[i];
  return sum;
}

/**
 * A minimal LangChain VectorStore backed by SQLite.
 *
 * Vectors are stored as Float32 blobs and kept in memory per source while the
 * server is warm. That is plenty for study-sized sources (a few thousand
 * chunks) and avoids pulling in a native vector extension.
 */
export class SqliteVectorStore extends VectorStore {
  declare FilterType: { sourceId?: string };

  private readonly sourceId: string;

  constructor(embeddings: EmbeddingsInterface, sourceId: string) {
    super(embeddings, { sourceId });
    this.sourceId = sourceId;
  }

  _vectorstoreType(): string {
    return "sqlite";
  }

  async addVectors(
    vectors: number[][],
    documents: Document[],
    _options?: Record<string, unknown>,
  ): Promise<void> {
    if (vectors.length !== documents.length) {
      throw new Error("addVectors: vectors and documents must have the same length");
    }

    const rows = documents.map((document, i) => {
      const vector = Float32Array.from(vectors[i]);
      return {
        sourceId: this.sourceId,
        idx: typeof document.metadata.idx === "number" ? document.metadata.idx : i,
        content: document.pageContent,
        page: typeof document.metadata.page === "number" ? document.metadata.page : null,
        startSec: typeof document.metadata.startSec === "number" ? document.metadata.startSec : null,
        endSec: typeof document.metadata.endSec === "number" ? document.metadata.endSec : null,
        embedding: Buffer.from(vector.buffer),
      };
    });

    const insertMany = db.transaction((batch: typeof rows) => {
      for (const row of batch) {
        insertChunkStmt.run(
          row.sourceId,
          row.idx,
          row.content,
          row.page,
          row.startSec,
          row.endSec,
          row.embedding,
        );
      }
    });

    insertMany(rows);
    invalidateSourceIndex(this.sourceId);
  }

  async addDocuments(documents: Document[], options?: Record<string, unknown>): Promise<void> {
    const vectors = await this.embeddings.embedDocuments(documents.map((d) => d.pageContent));
    await this.addVectors(vectors, documents, options);
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    _filter?: this["FilterType"],
  ): Promise<[Document, number][]> {
    const index = loadIndex(this.sourceId);
    if (index.chunks.length === 0) return [];
    if (query.length !== index.dims) {
      throw new EmbeddingMismatchError(
        `Query vector has ${query.length} dimensions but this source has ${index.dims}.`,
      );
    }

    const scored = index.chunks
      .map((chunk) => ({ chunk, score: dot(query, chunk.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, k));

    return scored.map(({ chunk, score }) => [
      new Document({
        pageContent: chunk.content,
        metadata: {
          sourceId: this.sourceId,
          chunkId: chunk.id,
          idx: chunk.idx,
          page: chunk.page,
          startSec: chunk.startSec,
          endSec: chunk.endSec,
          score,
        },
      }),
      score,
    ]);
  }
}

export function getStore(sourceId: string): SqliteVectorStore {
  return new SqliteVectorStore(getEmbeddings(), sourceId);
}
