import { useRef, useState, type DragEvent, type FormEvent } from "react";
import type { BusyState } from "../lib/types";
import { FileText, LinkIcon, Upload, YouTube } from "./Icons";

interface Props {
  busy: BusyState | null;
  variant?: "hero" | "modal";
  onPdf: (file: File) => void;
  onYouTube: (url: string) => void;
}

export function AddSourcePanel({ busy, variant = "hero", onPdf, onYouTube }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isBusy = busy !== null;

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setError("Please choose a PDF file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That PDF is larger than 25 MB.");
      return;
    }
    setError(null);
    onPdf(file);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (isBusy) return;
    pickFile(event.dataTransfer.files?.[0]);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value || isBusy) return;
    setError(null);
    setUrl("");
    onYouTube(value);
  }

  return (
    <div className="intake-panel">
      {busy && (
        <div className="busy-strip" role="status">
          <span className="spinner" />
          <span>{busy.label}</span>
        </div>
      )}

      <div className={`intake ${variant === "modal" ? "one-col" : ""}`}>
        <section className="intake-card">
          <div className="intake-head">
            <span className="ic">
              <FileText size={16} />
            </span>
            <span>
              Upload a PDF
              <small>Lecture notes, papers, slides</small>
            </span>
          </div>

          <button
            type="button"
            className={`drop ${dragging ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            disabled={isBusy}
          >
            <span className="drop-icon">
              <Upload size={18} />
            </span>
            <strong>Drop a PDF here</strong>
            <small>or click to browse · up to 25 MB</small>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </section>

        <section className="intake-card">
          <div className="intake-head yt">
            <span className="ic">
              <YouTube size={16} />
            </span>
            <span>
              Add a YouTube video
              <small>Any video with captions</small>
            </span>
          </div>

          <form className="url-row" onSubmit={handleSubmit}>
            <label className="url-field">
              <LinkIcon size={15} />
              <input
                className="url-input"
                type="text"
                inputMode="url"
                placeholder="https://youtu.be/…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={isBusy}
                aria-label="YouTube URL"
              />
            </label>
            <button className="btn-primary" type="submit" disabled={!url.trim() || isBusy}>
              <YouTube size={15} />
              Add video
            </button>
          </form>

          <p className="intake-note">
            Captions are fetched and indexed with timestamps, so answers can point you to the exact
            moment.
          </p>
        </section>
      </div>

      {error && <p className="panel-error">{error}</p>}

      {variant === "hero" && (
        <div className="features">
          <span className="feature">
            <FileText size={13} /> PDF &amp; YouTube
          </span>
          <span className="feature">
            <LinkIcon size={13} /> Answers cite their source
          </span>
          <span className="feature">
            <Upload size={13} /> Runs locally · SQLite
          </span>
        </div>
      )}
    </div>
  );
}
