import type { Source } from "./types";

export function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "";
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function describeSource(source: Source): string {
  if (source.kind === "pdf") {
    const pages = Number(source.meta.pages ?? 0);
    return pages > 0 ? `PDF · ${pages} ${pages === 1 ? "page" : "pages"}` : "PDF document";
  }
  const duration = Number(source.meta.durationSec ?? 0);
  const author = typeof source.meta.author === "string" ? source.meta.author : "";
  if (duration > 0 && author) return `${formatClock(duration)} · ${author}`;
  if (duration > 0) return `YouTube · ${formatClock(duration)}`;
  return author || "YouTube video";
}

export function citationLabel(page: number | null, startSec: number | null, endSec: number | null): string {
  if (page !== null) return `p. ${page}`;
  if (startSec !== null) {
    const start = formatClock(startSec);
    if (endSec !== null && endSec > startSec) return `${start}–${formatClock(endSec)}`;
    return start;
  }
  return "excerpt";
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
