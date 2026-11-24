import type { Source } from "../lib/types";
import { describeSource } from "../lib/format";
import { ArrowUpRight, Menu, Trash } from "./Icons";

interface Props {
  source: Source | null;
  canClear: boolean;
  onMenu: () => void;
  onClear: () => void;
}

export function TopBar({ source, canClear, onMenu, onClear }: Props) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Open library">
        <Menu size={19} />
      </button>

      <div className="topbar-title">
        <div className="eyebrow-row">
          <span className={`tiny-badge ${source?.kind ?? "none"}`}>
            {source ? (source.kind === "pdf" ? "PDF" : "YouTube") : "Library"}
          </span>
          {source && (
            <span className="topbar-meta">
              {describeSource(source)} · {source.chunkCount}{" "}
              {source.chunkCount === 1 ? "passage" : "passages"}
            </span>
          )}
        </div>
        <h1 title={source?.title}>{source?.title ?? "Your study desk"}</h1>
      </div>

      <div className="topbar-actions">
        {source?.kind === "youtube" && (
          <a
            className="ghost-btn"
            href={source.origin}
            target="_blank"
            rel="noreferrer"
            aria-label="Open video on YouTube"
            title="Open video on YouTube"
          >
            <ArrowUpRight size={14} />
            <span className="btn-label">Open video</span>
          </a>
        )}
        {source && canClear && (
          <button
            type="button"
            className="ghost-btn"
            onClick={onClear}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Trash size={14} />
            <span className="btn-label">Clear chat</span>
          </button>
        )}
      </div>
    </header>
  );
}
