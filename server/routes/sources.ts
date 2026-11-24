import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import {
  clearMessages,
  deleteSource,
  getMessages,
  getSource,
  listSources,
} from "../db.js";
import { toMessageDto, toSourceDto } from "../lib/dto.js";
import { HttpError } from "../lib/errors.js";
import { ingestPdf, ingestYouTube } from "../rag/ingest.js";
import { invalidateSourceIndex } from "../rag/vectorStore.js";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
  }),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      cb(new HttpError(400, "Only PDF files are supported here."));
      return;
    }
    cb(null, true);
  },
});

function requireSource(id: string) {
  const source = getSource(id);
  if (!source) throw new HttpError(404, "That source no longer exists.");
  return source;
}

export const sourcesRouter = Router();

sourcesRouter.get("/", (_req, res) => {
  res.json({ sources: listSources().map(toSourceDto) });
});

sourcesRouter.post("/pdf", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "Attach a PDF file in the 'file' field.");

  try {
    const result = await ingestPdf(file.path, file.originalname);
    res.status(201).json({ source: toSourceDto(requireSource(result.sourceId)) });
  } finally {
    await fs.unlink(file.path).catch(() => undefined);
  }
});

sourcesRouter.post("/youtube", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) throw new HttpError(400, "Paste a YouTube URL first.");
  if (url.length > 600) throw new HttpError(400, "That URL is suspiciously long.");

  const result = await ingestYouTube(url);
  res.status(201).json({ source: toSourceDto(requireSource(result.sourceId)) });
});

sourcesRouter.get("/:sourceId", (req, res) => {
  res.json({ source: toSourceDto(requireSource(req.params.sourceId)) });
});

sourcesRouter.get("/:sourceId/messages", (req, res) => {
  requireSource(req.params.sourceId);
  res.json({ messages: getMessages(req.params.sourceId).map(toMessageDto) });
});

sourcesRouter.delete("/:sourceId/messages", (req, res) => {
  requireSource(req.params.sourceId);
  clearMessages(req.params.sourceId);
  res.status(204).end();
});

sourcesRouter.delete("/:sourceId", (req, res) => {
  const removed = deleteSource(req.params.sourceId);
  if (!removed) throw new HttpError(404, "That source no longer exists.");
  invalidateSourceIndex(req.params.sourceId);
  res.status(204).end();
});
