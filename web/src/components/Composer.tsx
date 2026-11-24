import { useEffect, useRef, useState } from "react";
import { Send, Stop } from "./Icons";

interface Props {
  disabled: boolean;
  streaming: boolean;
  placeholder: string;
  onSend: (question: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, streaming, placeholder, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
  }, [value]);

  function submit() {
    const question = value.trim();
    if (!question || disabled || streaming) return;
    setValue("");
    onSend(question);
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled || streaming}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        aria-label="Ask a question about this source"
      />
      <div className="composer-bar">
        <span className="composer-hint">
          Enter to send · Shift + Enter for a new line
        </span>
        {streaming ? (
          <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop answering">
            <Stop size={15} />
          </button>
        ) : (
          <button
            type="submit"
            className="send-btn"
            disabled={disabled || !value.trim()}
            aria-label="Send question"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
