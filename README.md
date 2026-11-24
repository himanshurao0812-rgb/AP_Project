# Study RAG · LangChain edition

A small study companion: add a PDF or a YouTube video, then chat about it. Answers
stream in, cite the page or timestamp they came from, and everything is stored in
one local SQLite file.

This edition uses **LangChain.js** for the RAG plumbing. A sibling project,
[`../vanilla-rag`](../vanilla-rag), implements the same app without a framework so
you can compare the two.

```
PDF ──► PDFLoader ──► RecursiveCharacterTextSplitter ──► HuggingFace embeddings
                                                              │
YouTube ──► captions (timed) ──► splitter ────────────────────┤
                                                              ▼
                                                     SQLite vector store
                                                              │
question ──► embed ──► similarity search ──► ChatPromptTemplate ──► ChatOpenAI / ChatOllama
                                                              │
                                                     streamed answer + citations
```

## Quick start

Requires **Node.js 20+**. No API key is needed to try it.

```bash
cd langchain-rag
npm install
npm run dev
```

Open <http://localhost:5173>. The first upload downloads a ~23 MB embedding model
once; after that, indexing and search run locally on your CPU.

For a production-style run (single server, built assets):

```bash
npm run build
npm start          # http://127.0.0.1:5178
```

## Using it

1. Drop a PDF (up to 25 MB) or paste a YouTube link with captions.
2. Wait for the source to be indexed — the sidebar shows the passage count.
3. Ask a question. Answers stream in and each one lists numbered sources.
4. Click a citation to read the exact passage; for videos, "Open at 2:37" jumps
   to that moment on YouTube.

Every source keeps its own conversation. Deleting a source removes its chunks,
vectors and messages with it.

## Language model (optional)

Without a model the app still works in **extractive mode**: it retrieves the best
passages and shows them with citations rather than writing prose. To get written
answers, copy `.env.example` to `.env` and pick one:

```ini
# OpenAI, or any OpenAI-compatible endpoint
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://openrouter.ai/api/v1

# or a fully local model
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

`LLM_PROVIDER=auto` (the default) uses OpenAI when a key exists, then Ollama if it
is running, then extractive mode. Force one with `LLM_PROVIDER=openai|ollama|extractive`.

Embeddings are local by default (`Xenova/all-MiniLM-L6-v2`, 384 dims). Set
`EMBEDDINGS_PROVIDER=openai` to use `text-embedding-3-small` instead; existing
sources indexed with a different model are flagged so you can re-upload them.

## How LangChain is used

| Step | LangChain piece | File |
| --- | --- | --- |
| Read a PDF page by page | `PDFLoader` (`splitPages: true`) | `server/rag/loaders.ts` |
| Split into overlapping chunks | `RecursiveCharacterTextSplitter` (900 / 140) | `server/rag/ingest.ts` |
| Embed text | `HuggingFaceTransformersEmbeddings` | `server/rag/embeddings.ts` |
| Store vectors | custom `VectorStore` subclass over SQLite | `server/rag/vectorStore.ts` |
| Search | `similaritySearchWithScore` + score floor | `server/rag/retrieve.ts` |
| Prompt | `ChatPromptTemplate` + `MessagesPlaceholder` | `server/rag/prompt.ts`, `chain.ts` |
| Answer | LCEL: prompt → chat model → `StringOutputParser`, `.stream()` | `server/rag/chain.ts` |
| Models | `ChatOpenAI`, `ChatOllama` | `server/rag/llm.ts` |

The vector store is deliberately a thin `VectorStore` implementation: vectors are
stored as Float32 blobs in SQLite, loaded into memory per source, and ranked with
cosine similarity. That keeps the app to a single file on disk.

## Project structure

```
langchain-rag/
├─ server/
│  ├─ index.ts              Express app, health check, static UI, errors
│  ├─ config.ts             env config, paths, retrieval defaults
│  ├─ db.ts                 SQLite schema and queries (sources/chunks/messages)
│  ├─ types.ts              shared DTOs
│  ├─ lib/                  errors, timestamps, row → DTO
│  ├─ rag/                  loaders, splitter, embeddings, vector store,
│  │                        retrieval, prompt, LCEL chain, LLM resolver
│  └─ routes/               /sources (upload, list, delete) and /chat (SSE)
├─ web/
│  ├─ index.html
│  └─ src/
│     ├─ App.tsx            state, uploads, streaming chat, modals
│     ├─ components/        sidebar, chat, citations, composer, intake…
│     ├─ lib/               API client, types, formatting
│     └─ styles.css         hand-written CSS (no UI framework)
├─ .env.example
├─ vite.config.ts
└─ tsconfig*.json
```

Runtime data lives in `data/study-rag.sqlite` (git-ignored). Delete that file to
start over.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | provider, embedding model, source count |
| `GET` | `/api/sources` | list sources with passage counts |
| `POST` | `/api/sources/pdf` | multipart upload, field `file` |
| `POST` | `/api/sources/youtube` | `{ "url": "https://youtu.be/…" }` |
| `GET` | `/api/sources/:id/messages` | conversation history |
| `DELETE` | `/api/sources/:id/messages` | clear conversation |
| `DELETE` | `/api/sources/:id` | delete source + chunks + messages |
| `POST` | `/api/sources/:id/chat` | `{ "question": "…" }`, streams SSE |

The chat response is `text/event-stream` with `meta` (user message, citations,
provider), `token` chunks, then `done` (stored assistant message) or `error`.

## Notes

- **Scanned PDFs** are OCR'd automatically (Tesseract.js) when no selectable text
  is found. Very low-quality scans may still need preprocessing.
- **YouTube** needs a caption track. Auto-generated English captions work; the
  server falls back to any available language when English is missing.
- Ports: Vite dev server `5173`, API/production `5178`. Override the API port with
  `PORT` (also update the proxy in `vite.config.ts`).
- `better-sqlite3` is pinned below v13 because `@langchain/community` does not yet
  accept v13 as a peer.
