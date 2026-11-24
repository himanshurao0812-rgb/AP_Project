import { useEffect, useState } from "react";
import type { Health, Source } from "../lib/types";
import { describeSource } from "../lib/format";
import { Close, FileText, Plus, Refresh, Sparkles, Trash, YouTube } from "./Icons";

interface Props {
  sources: Source[];
  activeId: string | null;
  health: Health | null;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRefreshStatus: () => void;
  onClose: () => void;
}

function SourceBadge({ source }: { source: Source }) {
  const thumbnail = typeof source.meta.thumbnail === "string" ? source.meta.thumbnail : null;
  const [failed, setFailed] = useState(false);

  if (source.kind === "youtube" && thumbnail && !failed) {
    return (
      <img
        className="source-thumb"
        src={thumbnail}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`source-icon ${source.kind}`}>
      {source.kind === "pdf" ? <FileText size={17} /> : <YouTube size={17} />}
    </span>
  );
}

function SourceRow({
  source,
  active,
  onSelect,
  onDelete,
}: {
  source: Source;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3200);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <div
      className={`source-row ${active ? "active" : ""}`}
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      title={source.title}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <SourceBadge source={source} />
      <span className="source-copy">
        <span className="source-title">{source.title}</span>
        <span className="source-sub">
          {describeSource(source)} · {source.chunkCount} {source.chunkCount === 1 ? "passage" : "passages"}
        </span>
      </span>
      <button
        type="button"
        className={`source-delete ${confirming ? "danger" : ""}`}
        aria-label={confirming ? `Confirm delete ${source.title}` : `Delete ${source.title}`}
        title={confirming ? "Click again to delete" : "Delete source"}
        onClick={(event) => {
          event.stopPropagation();
          if (confirming) {
            onDelete();
          } else {
            setConfirming(true);
          }
        }}
      >
        {confirming ? "Delete?" : <Trash size={14} />}
      </button>
    </div>
  );
}

export function Sidebar({
  sources,
  activeId,
  health,
  open,
  onSelect,
  onNew,
  onDelete,
  onRefreshStatus,
  onClose,
}: Props) {
  const provider = health?.llm.provider ?? "loading";

  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Library">
      <div className="brand">
        <span className="brand-mark">
          <Sparkles size={19} />
        </span>
        <span className="brand-text">
          <span>Study RAG</span>
          <small>LangChain edition</small>
        </span>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close library">
          <Close size={17} />
        </button>
      </div>

      <button type="button" className="new-source" onClick={onNew}>
        <Plus size={16} />
        New source
      </button>

      <div className="library-head">
        <span>Library</span>
        <span className="count">{sources.length}</span>
      </div>

      <div className="source-list">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            active={source.id === activeId}
            onSelect={() => onSelect(source.id)}
            onDelete={() => onDelete(source.id)}
          />
        ))}

        {sources.length === 0 && (
          <p className="sidebar-empty">Nothing here yet. Upload a PDF or paste a YouTube link to begin.</p>
        )}
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="status-btn"
          onClick={onRefreshStatus}
          title="Refresh model status"
        >
          <span className={`dot ${provider}`} />
          <span className="status-copy">
            <strong>{health?.llm.label ?? "Checking models…"}</strong>
            <small>{health?.llm.detail ?? "Connecting to the server"}</small>
          </span>
          <Refresh size={13} />
        </button>
        <div className="embed-line" title={health?.embeddings.model}>
          Embeddings · {health?.embeddings.model ?? "—"}
        </div>
      </div>
    </aside>
  );
}
