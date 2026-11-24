import { useState } from "react";
import type { Citation, SourceKind } from "../lib/types";
import { citationLabel, formatClock } from "../lib/format";
import { ArrowUpRight, Quote } from "./Icons";

export function Citations({
  citations,
  kind,
  origin,
}: {
  citations: Citation[];
  kind: SourceKind;
  origin: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (citations.length === 0) return null;

  const selected = citations.find((citation) => citation.n === open) ?? null;

  return (
    <div className="cites">
      <div className="cites-head">
        <Quote size={12} />
        Sources
      </div>
      <div className="cites-list">
        {citations.map((citation) => (
          <button
            key={citation.n}
            type="button"
            className={`cite ${open === citation.n ? "open" : ""}`}
            aria-expanded={open === citation.n}
            onClick={() => setOpen(open === citation.n ? null : citation.n)}
            title={`Passage ${citation.n} · ${Math.round(citation.score * 100)}% match`}
          >
            <span className="cite-n">{citation.n}</span>
            <span>{citationLabel(citation.page, citation.startSec, citation.endSec)}</span>
            <span className="cite-score">{Math.round(citation.score * 100)}%</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="cite-detail">
          <p>{selected.snippet}</p>
          <div className="cite-detail-foot">
            <span>
              Passage {selected.n} · {Math.round(selected.score * 100)}% match
            </span>
            {kind === "youtube" && selected.startSec !== null && (
              <a
                href={`${origin}${origin.includes("?") ? "&" : "?"}t=${Math.floor(selected.startSec)}s`}
                target="_blank"
                rel="noreferrer"
              >
                Watch at {formatClock(selected.startSec)}
                <ArrowUpRight size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
