import { AlertTriangle, Sparkles } from "./Icons";

export function Toast({ text, kind }: { text: string; kind: "error" | "info" }) {
  return (
    <div className={`toast ${kind}`} role="status">
      {kind === "error" ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
      <span>{text}</span>
    </div>
  );
}
