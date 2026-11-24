import Database from "better-sqlite3";
import { config, ensureDataDirs } from "./config.js";

ensureDataDirs();

export type SourceKind = "pdf" | "youtube";
export type Role = "user" | "assistant";

export interface SourceRow {
  id: string;
  kind: SourceKind;
  title: string;
  origin: string;
  meta: string;
  embedding_model: string;
  dims: number;
  created_at: string;
}

export interface SourceWithCount extends SourceRow {
  chunk_count: number;
}

export interface ChunkRow {
  id: number;
  source_id: string;
  idx: number;
  content: string;
  page: number | null;
  start_sec: number | null;
  end_sec: number | null;
  embedding: Buffer;
}

export interface MessageRow {
  id: number;
  source_id: string;
  role: Role;
  content: string;
  citations: string | null;
  created_at: string;
}

export const db = new Database(config.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    title           TEXT NOT NULL,
    origin          TEXT NOT NULL,
    meta            TEXT NOT NULL DEFAULT '{}',
    embedding_model TEXT NOT NULL,
    dims            INTEGER NOT NULL,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    idx        INTEGER NOT NULL,
    content    TEXT NOT NULL,
    page       INTEGER,
    start_sec  REAL,
    end_sec    REAL,
    embedding  BLOB NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id, idx);

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    citations  TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_source ON messages(source_id, id);
`);

const now = () => new Date().toISOString();

export function listSources(): SourceWithCount[] {
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM chunks c WHERE c.source_id = s.id) AS chunk_count
       FROM sources s
       ORDER BY s.created_at DESC`,
    )
    .all() as SourceWithCount[];
}

export function getSource(id: string): SourceWithCount | undefined {
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM chunks c WHERE c.source_id = s.id) AS chunk_count
       FROM sources s
       WHERE s.id = ?`,
    )
    .get(id) as SourceWithCount | undefined;
}

export function createSource(input: {
  id: string;
  kind: SourceKind;
  title: string;
  origin: string;
  meta: unknown;
  embeddingModel: string;
  dims: number;
}): void {
  db.prepare(
    `INSERT INTO sources (id, kind, title, origin, meta, embedding_model, dims, created_at)
     VALUES (@id, @kind, @title, @origin, @meta, @embeddingModel, @dims, @createdAt)`,
  ).run({
    id: input.id,
    kind: input.kind,
    title: input.title,
    origin: input.origin,
    meta: JSON.stringify(input.meta ?? {}),
    embeddingModel: input.embeddingModel,
    dims: input.dims,
    createdAt: now(),
  });
}

export function updateSource(
  id: string,
  patch: { title?: string; meta?: unknown; embeddingModel?: string; dims?: number },
): void {
  const current = db.prepare("SELECT title, meta, embedding_model, dims FROM sources WHERE id = ?").get(id) as
    | Pick<SourceRow, "title" | "meta" | "embedding_model" | "dims">
    | undefined;
  if (!current) return;
  db.prepare(
    `UPDATE sources SET title = ?, meta = ?, embedding_model = ?, dims = ? WHERE id = ?`,
  ).run(
    patch.title ?? current.title,
    patch.meta === undefined ? current.meta : JSON.stringify(patch.meta),
    patch.embeddingModel ?? current.embedding_model,
    patch.dims ?? current.dims,
    id,
  );
}

export function deleteSource(id: string): boolean {
  return db.prepare("DELETE FROM sources WHERE id = ?").run(id).changes > 0;
}

export function deleteChunks(sourceId: string): void {
  db.prepare("DELETE FROM chunks WHERE source_id = ?").run(sourceId);
}

export const insertChunkStmt = db.prepare(
  `INSERT INTO chunks (source_id, idx, content, page, start_sec, end_sec, embedding)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

export function getChunks(sourceId: string): ChunkRow[] {
  return db
    .prepare(
      `SELECT id, source_id, idx, content, page, start_sec, end_sec, embedding
       FROM chunks WHERE source_id = ? ORDER BY idx ASC`,
    )
    .all(sourceId) as ChunkRow[];
}

export function getMessages(sourceId: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE source_id = ? ORDER BY id ASC")
    .all(sourceId) as MessageRow[];
}

export function addMessage(
  sourceId: string,
  role: Role,
  content: string,
  citations: unknown = null,
): MessageRow {
  const createdAt = now();
  const citationsJson = citations == null ? null : JSON.stringify(citations);
  const result = db
    .prepare(
      `INSERT INTO messages (source_id, role, content, citations, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sourceId, role, content, citationsJson, createdAt);
  return {
    id: Number(result.lastInsertRowid),
    source_id: sourceId,
    role,
    content,
    citations: citationsJson,
    created_at: createdAt,
  };
}

export function clearMessages(sourceId: string): void {
  db.prepare("DELETE FROM messages WHERE source_id = ?").run(sourceId);
}

export function countSources(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM sources").get() as { n: number }).n;
}

export function closeDatabase(): void {
  db.close();
}
