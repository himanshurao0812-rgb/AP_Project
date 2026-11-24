import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, "..");

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

const dataDir = path.resolve(projectRoot, env("DATA_DIR", "data"));

export const config = {
  port: Number(env("PORT", "5178")),
  projectRoot,
  dataDir,
  dbPath: path.join(dataDir, "study-rag.sqlite"),
  uploadsDir: path.join(dataDir, "uploads"),
  webDist: path.join(projectRoot, "web", "dist"),
  embeddings: {
    provider: env("EMBEDDINGS_PROVIDER", "local") as "local" | "openai",
    localModel: env("LOCAL_EMBEDDING_MODEL", "Xenova/all-MiniLM-L6-v2"),
    openaiModel: env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
    openaiKey: env("OPENAI_API_KEY"),
    openaiBaseUrl: env("OPENAI_BASE_URL") || undefined,
  },
  llm: {
    /** auto | openai | ollama | extractive */
    requested: env("LLM_PROVIDER", "auto").toLowerCase(),
    openaiKey: env("LLM_API_KEY") || env("OPENAI_API_KEY"),
    openaiBaseUrl: env("LLM_BASE_URL") || env("OPENAI_BASE_URL") || undefined,
    openaiModel:
      env("LLM_MODEL") ||
      env("OPENAI_MODEL") ||
      ((env("LLM_API_KEY") || env("OPENAI_API_KEY")) ? "deepseek-v4.1-flash:free" : "gpt-4o-mini"),
    ollamaBaseUrl: env("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
    ollamaModel: env("OLLAMA_MODEL", "llama3.2"),
  },
  retrieval: {
    topK: Number(env("RETRIEVAL_TOP_K", "6")),
    minScore: Number(env("RETRIEVAL_MIN_SCORE", "0.12")),
  },
} as const;

export function ensureDataDirs(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}
