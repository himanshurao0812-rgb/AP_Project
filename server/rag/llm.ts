import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Document } from "@langchain/core/documents";
import { config } from "../config.js";
import { formatTimestamp } from "../lib/time.js";
import type { LlmModeDto } from "../types.js";

export interface LlmMode extends LlmModeDto {}

const CONFIGURE_HINT =
  "Add OPENAI_API_KEY to .env, or run Ollama locally (ollama serve && ollama pull llama3.2). Until then, answers are extractive.";

let cached: { mode: LlmMode; at: number } | null = null;
const CACHE_MS = 15_000;

async function ollamaReachable(): Promise<boolean> {
  const base = config.llm.ollamaBaseUrl.replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function openaiMode(): LlmMode | null {
  if (!config.llm.openaiKey) return null;
  return {
    provider: "openai",
    model: config.llm.openaiModel,
    label: "OpenAI",
    detail: config.llm.openaiModel,
  };
}

function ollamaMode(): LlmMode {
  return {
    provider: "ollama",
    model: config.llm.ollamaModel,
    label: "Ollama",
    detail: `${config.llm.ollamaModel} · local`,
  };
}

function extractiveMode(note?: string): LlmMode {
  return {
    provider: "extractive",
    model: "none",
    label: "Extractive mode",
    detail: "No language model",
    note: note ?? CONFIGURE_HINT,
  };
}

export async function resolveLlmMode(force = false): Promise<LlmMode> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.mode;

  const requested = config.llm.requested;
  let mode: LlmMode;

  if (requested === "extractive") {
    mode = extractiveMode("Extractive mode was selected with LLM_PROVIDER=extractive.");
  } else if (requested === "openai") {
    mode =
      openaiMode() ??
      extractiveMode("LLM_PROVIDER=openai was set, but OPENAI_API_KEY is missing. " + CONFIGURE_HINT);
  } else if (requested === "ollama") {
    mode = (await ollamaReachable())
      ? ollamaMode()
      : extractiveMode(
          `Ollama isn't reachable at ${config.llm.ollamaBaseUrl}. Start it with "ollama serve".`,
        );
  } else {
    mode = openaiMode() ?? ((await ollamaReachable()) ? ollamaMode() : extractiveMode());
  }

  cached = { mode, at: Date.now() };
  return mode;
}

export function createChatModel(mode: LlmMode): BaseChatModel {
  if (mode.provider === "openai") {
    return new ChatOpenAI({
      apiKey: config.llm.openaiKey,
      model: config.llm.openaiModel,
      temperature: 0.7,
      maxRetries: 1,
      timeout: 60_000,
      configuration: config.llm.openaiBaseUrl ? { baseURL: config.llm.openaiBaseUrl } : undefined,
    });
  }

  if (mode.provider === "ollama") {
    return new ChatOllama({
      baseUrl: config.llm.ollamaBaseUrl,
      model: config.llm.ollamaModel,
      temperature: 0.7,
    });
  }

  throw new Error("Extractive mode does not use a chat model.");
}

function shorten(text: string, max = 420): string {
  const clean = text.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

/**
 * Deterministic fallback used when no LLM is configured. It still gives the
 * reader the most relevant passages, with working citations.
 */
export function extractiveAnswer(question: string, documents: Document[]): string {
  if (documents.length === 0) {
    return "I couldn't find a relevant passage in this source. Try rephrasing the question.";
  }

  const intro = `I don't have a language model configured, so here are the passages that best match “${question.trim()}”. Add an LLM in \`.env\` for a written answer.`;

  const passages = documents
    .slice(0, 3)
    .map((document, i) => {
      const page = document.metadata.page;
      const start = document.metadata.startSec;
      const where =
        typeof page === "number"
          ? ` — page ${page}`
          : typeof start === "number"
            ? ` — ${formatTimestamp(start)}`
            : "";
      return `**Passage ${i + 1}${where}**\n\n> ${shorten(document.pageContent)}`;
    })
    .join("\n\n");

  return `${intro}\n\n${passages}`;
}
