import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { config } from "../config.js";

let cached: EmbeddingsInterface | null = null;

/** Stable identifier stored next to every source, so we can detect a model change. */
export function embeddingModelId(): string {
  return config.embeddings.provider === "openai"
    ? config.embeddings.openaiModel
    : config.embeddings.localModel;
}

export function getEmbeddings(): EmbeddingsInterface {
  if (cached) return cached;

  if (config.embeddings.provider === "openai") {
    if (!config.embeddings.openaiKey) {
      throw new Error("EMBEDDINGS_PROVIDER=openai requires OPENAI_API_KEY to be set.");
    }
    cached = new OpenAIEmbeddings({
      apiKey: config.embeddings.openaiKey,
      model: config.embeddings.openaiModel,
      configuration: config.embeddings.openaiBaseUrl
        ? { baseURL: config.embeddings.openaiBaseUrl }
        : undefined,
    });
    return cached;
  }

  // Local, no API key needed. The model (~23 MB, quantized) is downloaded
  // from Hugging Face the first time and then cached on disk.
  cached = new HuggingFaceTransformersEmbeddings({
    model: config.embeddings.localModel,
    batchSize: 16,
    stripNewLines: true,
    // transformers.js supports `dtype`, but LangChain's published type still
    // describes the older PretrainedOptions shape.
    pretrainedOptions: { dtype: "q8" } as unknown as { cache_dir?: string },
  });
  return cached;
}

export function embeddingsLabel(): string {
  return config.embeddings.provider === "openai"
    ? config.embeddings.openaiModel
    : `${config.embeddings.localModel} (local)`;
}
