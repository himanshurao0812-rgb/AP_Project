import fs from "node:fs/promises";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { YoutubeTranscript } from "youtube-transcript";
import { createWorker } from "tesseract.js";
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { HttpError } from "../lib/errors.js";
import { formatTimestamp } from "../lib/time.js";

export interface LoadedSource {
  kind: "pdf" | "youtube";
  title: string;
  origin: string;
  meta: Record<string, unknown>;
  documents: Document[];
}

function cleanText(text: string): string {
  return text
    .replace(/\u00ad/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function prettyFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.length > 0 ? base : "Untitled PDF";
}

function decodeFileName(name: string): string {
  // Busboy decodes multipart filenames as latin1; this repairs UTF-8 names.
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

async function ocrPdf(filePath: string): Promise<Document<any>[]> {
  const buffer = await fs.readFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const worker = await createWorker("eng");
  const documents: Document<any>[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const image = await renderPageAsImage(pdf, pageNumber, {
        scale: 2,
        format: "png",
        canvasImport: () => import("@napi-rs/canvas"),
      });
      const { data } = await worker.recognize(Buffer.from(image));
      const text = cleanText(data.text);
      if (text.length > 20) {
        documents.push(new Document({ pageContent: text, metadata: { page: pageNumber } }));
      }
    }
  } finally {
    await worker.terminate();
  }

  return documents;
}

export async function loadPdfFile(filePath: string, originalName: string): Promise<LoadedSource> {
  const displayName = decodeFileName(originalName);
  const loader = new PDFLoader(filePath, { splitPages: true, parsedItemSeparator: "" });

  let pages: Document[];
  try {
    pages = await loader.load();
  } catch (error) {
    throw new HttpError(
      422,
      `We couldn't read that PDF (${error instanceof Error ? error.message : "unknown error"}).`,
    );
  }

  let documents: Document<any>[] = pages
    .map(
      (page) =>
        new Document({
          pageContent: cleanText(page.pageContent),
          metadata: {
            page:
              typeof page.metadata?.loc?.pageNumber === "number"
                ? page.metadata.loc.pageNumber
                : null,
          },
        }),
    )
    .filter((page) => page.pageContent.length > 20);

  let ocr = false;
  if (documents.length === 0) {
    try {
      const ocrDocuments = await ocrPdf(filePath);
      if (ocrDocuments.length > 0) {
        documents = ocrDocuments;
        ocr = true;
      }
    } catch {
      // fall through to the clearer error below
    }
  }

  if (documents.length === 0) {
    throw new HttpError(
      422,
      "This PDF has no selectable text and OCR could not read it. Try a higher-quality scan or run it through OCR first.",
    );
  }

  return {
    kind: "pdf",
    title: prettyFileName(displayName),
    origin: displayName,
    meta: {
      pages: pages.length || documents.length,
      textPages: documents.length,
      title: pages[0]?.metadata?.pdf?.info?.Title?.trim() || undefined,
      ocr,
    },
    documents,
  };
}

export function extractYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "") && parts[1]) {
        return /^[\w-]{11}$/.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchVideoMeta(videoId: string): Promise<{ title?: string; author?: string; thumbnail?: string }> {
  const target = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (!response.ok) return {};
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return { title: data.title, author: data.author_name, thumbnail: data.thumbnail_url };
  } catch {
    return {};
  }
}

async function fetchTranscript(videoId: string) {
  const attempts: Array<{ lang?: string }> = [{ lang: "en" }, {}];
  let lastError: unknown = null;

  for (const options of attempts) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, options);
      if (transcript.length > 0) return transcript;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "no captions found";
  throw new HttpError(
    422,
    `Couldn't load captions for this video (${detail}). It may have captions disabled or be private.`,
  );
}

export async function loadYouTube(input: string): Promise<LoadedSource> {
  const videoId = extractYouTubeId(input);
  if (!videoId) {
    throw new HttpError(400, "That doesn't look like a YouTube link. Try a URL like https://youtu.be/…");
  }

  const [meta, transcript] = await Promise.all([fetchVideoMeta(videoId), fetchTranscript(videoId)]);

  const lines = transcript
    .map((item) => {
      const text = item.text.replace(/\s+/g, " ").trim();
      if (!text) return null;
      return `[${formatTimestamp(item.offset / 1000)}] ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    throw new HttpError(422, "The caption track for this video is empty.");
  }

  const last = transcript[transcript.length - 1];
  const durationSec = Math.round((last.offset + last.duration) / 1000);
  const title = meta.title?.trim() || `YouTube video ${videoId}`;

  return {
    kind: "youtube",
    title,
    origin: `https://www.youtube.com/watch?v=${videoId}`,
    meta: {
      videoId,
      author: meta.author,
      thumbnail: meta.thumbnail,
      durationSec,
      segments: transcript.length,
      language: transcript[0]?.lang ?? "auto",
    },
    documents: [
      new Document({
        pageContent: lines.join("\n"),
        metadata: { page: null },
      }),
    ],
  };
}
