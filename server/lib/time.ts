/** Format a number of seconds as m:ss (or h:mm:ss for long videos). */
export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Read every [m:ss] or [h:mm:ss] marker in a chunk, in order. */
export function parseTimestampMarkers(text: string): number[] {
  const found: number[] = [];
  const re = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = match[3] === undefined ? null : Number(match[3]);
    found.push(third === null ? first * 60 + second : first * 3600 + second * 60 + third);
  }
  return found;
}
