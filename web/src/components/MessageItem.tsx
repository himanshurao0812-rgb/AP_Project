import type { Message, SourceKind } from "../lib/types";
import { formatTime } from "../lib/format";
import { Citations } from "./Citations";
import { Markdown } from "./Markdown";
import { Sparkles } from "./Icons";

export function MessageItem({
  message,
  kind,
  origin,
}: {
  message: Message;
  kind: SourceKind;
  origin: string;
}) {
  if (message.role === "user") {
    return (
      <article className="msg user">
        <div className="msg-main">
          <div className="bubble-user">{message.content}</div>
          <div className="msg-time right">{formatTime(message.createdAt)}</div>
        </div>
      </article>
    );
  }

  return (
    <article className="msg assistant">
      <span className="msg-avatar">
        <Sparkles size={14} />
      </span>
      <div className="msg-main">
        <div className="msg-head">
          <strong>Study RAG</strong>
          <time>{formatTime(message.createdAt)}</time>
        </div>
        <Markdown>{message.content}</Markdown>
        {message.citations && (
          <Citations citations={message.citations} kind={kind} origin={origin} />
        )}
      </div>
    </article>
  );
}
