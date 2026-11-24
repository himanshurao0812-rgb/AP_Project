import { randomUUID } from "node:crypto";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createSource, deleteSource } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { parseTimestampMarkers } from "../lib/time.js";
import { embeddingModelId, getEmbeddings } from "./embeddings.js";
import { loadPdfFile, loadYouTube, type LoadedSource } from "./loaders.js";
import { invalidateSourceIndex, SqliteVectorStore } from "./vectorStore.js";

export interface IngestResult {
  sourceId: string;
  chunkCount: number;
  dims: number;
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 900,
  chunkOverlap: 140,
  separators: ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
});

function enrichChunk(document: Document, idx: number, kind: LoadedSource["kind"]): Document {
  const markers = kind === "youtube" ? parseTimestampMarkers(document.pageContent) : [];
  return new Document({
    pageContent: document.pageContent.trim(),
    metadata: {
      ...document.metadata,
      idx,
      page: typeof document.metadata.page === "number" ? document.metadata.page : null,
      startSec: markers.length > 0 ? markers[0] : null,
      endSec: markers.length > 0 ? markers[markers.length - 1] : null,
    },
  });
}

async function indexLoadedSource(loaded: LoadedSource): Promise<IngestResult> {
  const split = await splitter.splitDocuments(loaded.documents);
  const chunks = split
    .map((document, idx) => enrichChunk(document, idx, loaded.kind))
    .filter((document) => document.pageContent.length > 0);

  if (chunks.length === 0) {
    throw new HttpError(422, "Nothing could be indexed from this source.");
  }

  const embeddings = getEmbeddings();
  const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.pageContent));

  const dims = vectors[0]?.length ?? 0;
  if (!dims) throw new HttpError(500, "The embedding model returned empty vectors.");

  const sourceId = randomUUID();
  createSource({
    id: sourceId,
    kind: loaded.kind,
    title: loaded.title,
    origin: loaded.origin,
    meta: { ...loaded.meta, chunkCount: chunks.length },
    embeddingModel: embeddingModelId(),
    dims,
  });

  try {
    const store = new SqliteVectorStore(embeddings, sourceId);
    await store.addVectors(vectors, chunks);
  } catch (error) {
    deleteSource(sourceId);
    throw error;
  }

  invalidateSourceIndex(sourceId);

  return { sourceId, chunkCount: chunks.length, dims };
}

export async function ingestPdf(filePath: string, originalName: string): Promise<IngestResult> {
  const loaded = await loadPdfFile(filePath, originalName);
  return indexLoadedSource(loaded);
}

export async function ingestYouTube(url: string): Promise<IngestResult> {
  const loaded = await loadYouTube(url);
  return indexLoadedSource(loaded);
}
