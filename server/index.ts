import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { config, ensureDataDirs } from "./config.js";
import { closeDatabase, countSources } from "./db.js";
import { embeddingsLabel } from "./rag/embeddings.js";
import { resolveLlmMode } from "./rag/llm.js";
import { chatRouter } from "./routes/chat.js";
import { sourcesRouter } from "./routes/sources.js";

ensureDataDirs();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res, next) => {
  try {
    const llm = await resolveLlmMode();
    res.json({
      ok: true,
      llm,
      embeddings: { model: embeddingsLabel() },
      stats: { sources: countSources() },
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/sources", sourcesRouter);
app.use("/api/sources", chatRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(config.webDist, "index.html"));
  });
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const err = error as { status?: number; code?: string; message?: string };
  let status = typeof err.status === "number" ? err.status : 500;
  let message = err.message || "Something went wrong.";

  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "That PDF is larger than 25 MB.";
  }
  if (status >= 500) {
    console.error("[api]", error);
  }

  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: message });
};

app.use(errorHandler);

const server = app.listen(config.port, "127.0.0.1", async () => {
  const mode = await resolveLlmMode();
  console.log("");
  console.log("  Study RAG · LangChain edition");
  console.log(`  API      http://127.0.0.1:${config.port}/api`);
  console.log(`  UI       http://127.0.0.1:${config.port}`);
  console.log(`  Chat     ${mode.label} (${mode.detail})`);
  console.log(`  Embed    ${embeddingsLabel()}`);
  console.log(`  SQLite   ${config.dbPath}`);
  console.log("");
  console.log("  First ingest downloads the local embedding model (~23 MB).");
  console.log("");
});

server.on("error", (error) => {
  console.error("Could not start the server:", error.message);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    closeDatabase();
    process.exit(0);
  });
}
