import { useEffect, useRef } from "react";
import type { Health, Message, Source, StreamState } from "../lib/types";
import { AlertTriangle, BookOpen, Sparkles, YouTube } from "./Icons";
import { Citations } from "./Citations";
import { Markdown } from "./Markdown";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";

interface Props {
  source: Source;
  messages: Message[];
  stream: StreamState | null;
  loading: boolean;
  health: Health | null;
  onSend: (question: string) => void;
  onStop: () => void;
  onOpenSetup: () => void;
}

function suggestionsFor(source: Source): string[] {
  if (source.kind === "youtube") {
    return [
      "Summarise this video",
      "What are the key timestamps?",
      "Explain the main idea simply",
    ];
  }
  return [
    "Summarise the key ideas",
    "What should I remember for an exam?",
    "Explain the hardest concept simply",
  ];
}

export function ChatView({
  source,
  messages,
  stream,
  loading,
  health,
  onSend,
  onStop,
  onOpenSetup,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [source.id, messages.length, stream?.phase, stream?.text]);

  const extractive = health?.llm.provider === "extractive";
  const showWelcome = !loading && messages.length === 0 && !stream;

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-inner">
          {loading && (
            <div className="loading-thread" aria-label="Loading conversation">
              <div className="skeleton w-60" />
              <div className="skeleton w-90" />
              <div className="skeleton w-40" />
            </div>
          )}

          {showWelcome && (
            <div className="welcome">
              <span className="welcome-icon">
                {source.kind === "pdf" ? <BookOpen size={22} /> : <YouTube size={22} />}
              </span>
              <h2>Ask this source anything.</h2>
              <p>
                I’ll search the {source.kind === "pdf" ? "document" : "transcript"} and answer with
                passages you can open, so you can check every claim.
              </p>
              <div className="suggestions">
                {suggestionsFor(source).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="suggestion"
                    onClick={() => onSend(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageItem key={message.id} message={message} kind={source.kind} origin={source.origin} />
          ))}

          {stream && (
            <article className="msg assistant">
              <span className="msg-avatar">
                <Sparkles size={14} />
              </span>
              <div className="msg-main">
                <div className="msg-head">
                  <strong>Study RAG</strong>
                  <span className="live-label">
                    {stream.phase === "retrieving" ? "searching" : "writing"}
                  </span>
                </div>

                {stream.phase === "retrieving" && stream.text.length === 0 ? (
                  <div className="thinking">
                    <span className="dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    Searching the passages…
                  </div>
                ) : (
                  <>
                    <Markdown>{stream.text}</Markdown>
                    <div className="stream-note">
                      <span className="pulse-dot" />
                      Generating answer
                    </div>
                    <Citations citations={stream.citations} kind={source.kind} origin={source.origin} />
                  </>
                )}
              </div>
            </article>
          )}
        </div>
      </div>

      <div className="chat-bottom">
        <div className="chat-bottom-inner">
          {!source.compatible && (
            <div className="banner danger">
              <AlertTriangle size={15} />
              <span>
                This source was indexed with <strong>{source.embeddingModel}</strong>, which no longer
                matches the server’s embedding model. Re-upload it to keep chatting.
              </span>
            </div>
          )}

          {extractive && (
            <div className="banner info">
              <Sparkles size={15} />
              <span>
                <strong>Extractive mode.</strong> No language model is configured, so you’ll get the
                closest passages instead of written answers.{" "}
                <button type="button" onClick={onOpenSetup}>
                  Set up an LLM
                </button>
              </span>
            </div>
          )}

          <Composer
            key={source.id}
            disabled={!source.compatible}
            streaming={stream !== null}
            placeholder={`Ask about “${source.title}”…`}
            onSend={onSend}
            onStop={onStop}
          />
          <p className="footnote">
            Answers are grounded in this source only · citations open the exact passage
          </p>
        </div>
      </div>
    </div>
  );
}
