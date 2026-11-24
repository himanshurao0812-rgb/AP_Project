import type { Document } from "@langchain/core/documents";
import { config } from "../config.js";
import type { Citation } from "../types.js";
import { getStore } from "./vectorStore.js";

export interface RetrievedPassage {
  n: number;
  document: Document;
  score: number;
  citation: Citation;
}

function makeSnippet(text: string): string {
  const clean = text
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 260 ? `${clean.slice(0, 260).trimEnd()}…` : clean;
}

/**
 * Embeds the question, searches the source's LangChain vector store, and keeps
 * the strongest, non-duplicate passages. If nothing clears the score floor we
 * still return the best few so the model can explain that the source is thin.
 */
export async function retrievePassages(
  sourceId: string,
  question: string,
  k: number = config.retrieval.topK,
): Promise<RetrievedPassage[]> {
  const store = getStore(sourceId);
  const raw = await store.similaritySearchWithScore(question, Math.max(k * 3, 15));

  const seenIds = new Set<number>();
  const seenText = new Set<string>();
  const unique: Array<{ document: Document; score: number }> = [];

  for (const [document, score] of raw) {
    const chunkId = Number(document.metadata.chunkId);
    const fingerprint = document.pageContent.slice(0, 120);
    if (Number.isFinite(chunkId) && seenIds.has(chunkId)) continue;
    if (seenText.has(fingerprint)) continue;
    if (Number.isFinite(chunkId)) seenIds.add(chunkId);
    seenText.add(fingerprint);
    unique.push({ document: document as Document, score });
  }

  let picked = unique.filter((item) => item.score >= config.retrieval.minScore).slice(0, k);
  if (picked.length === 0) picked = unique.slice(0, Math.min(3, unique.length));

  return picked.map(({ document, score }, index) => {
    const page = typeof document.metadata.page === "number" ? document.metadata.page : null;
    const startSec =
      typeof document.metadata.startSec === "number" ? document.metadata.startSec : null;
    const endSec = typeof document.metadata.endSec === "number" ? document.metadata.endSec : null;

    return {
      n: index + 1,
      document,
      score,
      citation: {
        n: index + 1,
        chunkId: Number(document.metadata.chunkId),
        page,
        startSec,
        endSec,
        snippet: makeSnippet(document.pageContent),
        score: Math.max(0, Math.min(1, score)),
      },
    };
  });
}
