import { Router } from "express";
import { addMessage, getMessages, getSource } from "../db.js";
import { toMessageDto } from "../lib/dto.js";
import { errorMessage, HttpError } from "../lib/errors.js";
import { streamAnswer, toHistory } from "../rag/chain.js";
import { resolveLlmMode } from "../rag/llm.js";
import { retrievePassages } from "../rag/retrieve.js";

const MAX_QUESTION_CHARS = 2000;

export const chatRouter = Router();

chatRouter.post("/:sourceId/chat", async (req, res) => {
  const source = getSource(req.params.sourceId);
  if (!source) throw new HttpError(404, "That source no longer exists.");

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) throw new HttpError(400, "Ask a question first.");
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpError(400, `Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
  }

  // Capture history before storing the new question.
  const history = toHistory(getMessages(source.id).map(toMessageDto));
  const userMessage = addMessage(source.id, "user", question);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const controller = new AbortController();
  let clientGone = false;

  const send = (event: string, data: unknown) => {
    if (clientGone || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onClose = () => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  };
  res.on("close", onClose);

  try {
    const passages = await retrievePassages(source.id, question);
    const citations = passages.map((passage) => passage.citation);
    const mode = await resolveLlmMode();

    send("meta", {
      userMessage: toMessageDto(userMessage),
      citations,
      provider: mode,
    });

    let answer = "";
    for await (const token of streamAnswer({
      mode,
      question,
      history,
      passages,
      signal: controller.signal,
    })) {
      answer += token;
      send("token", { text: token });
    }

    if (controller.signal.aborted || clientGone) {
      res.end();
      return;
    }

    if (!answer.trim()) {
      throw new Error("The model returned an empty answer. Try rephrasing your question.");
    }

    const assistant = addMessage(source.id, "assistant", answer, citations);
    send("done", { message: toMessageDto(assistant) });
  } catch (error) {
    if (!clientGone) {
      send("error", {
        message:
          error instanceof Error && error.name === "AbortError"
            ? "The request was cancelled."
            : errorMessage(error),
      });
    }
  } finally {
    res.off("close", onClose);
    if (!res.writableEnded) res.end();
  }
});
