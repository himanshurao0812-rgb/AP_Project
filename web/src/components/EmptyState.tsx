import type { BusyState } from "../lib/types";
import { AddSourcePanel } from "./AddSourcePanel";

export function EmptyState({
  busy,
  onPdf,
  onYouTube,
}: {
  busy: BusyState | null;
  onPdf: (file: File) => void;
  onYouTube: (url: string) => void;
}) {
  return (
    <div className="empty">
      <div className="empty-inner">
        <div className="hero">
          <span className="eyebrow">Your study desk</span>
          <h2>Turn a PDF or a video into a conversation.</h2>
          <p className="lede">
            Upload your notes or drop in a talk. Study RAG reads the source, finds the right
            passages, and answers with citations — stored locally, in one SQLite file.
          </p>

          <AddSourcePanel busy={busy} onPdf={onPdf} onYouTube={onYouTube} />

          <p className="hero-note">
            The first upload downloads a small embedding model once (about 23 MB). After that,
            everything runs on your machine.
          </p>
        </div>
      </div>
    </div>
  );
}
