import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import type { MessageDto } from "../types.js";
import { createChatModel, extractiveAnswer, type LlmMode } from "./llm.js";
import { buildContext, SYSTEM_PROMPT } from "./prompt.js";
import type { RetrievedPassage } from "./retrieve.js";

export interface AnswerInput {
  mode: LlmMode;
  question: string;
  history: BaseMessage[];
  passages: RetrievedPassage[];
  signal: AbortSignal;
}

/** Turn the last few stored messages into LangChain chat messages. */
export function toHistory(messages: MessageDto[], limit = 8): BaseMessage[] {
  return messages
    .slice(-limit)
    .filter((message) => message.content.trim().length > 0)
    .map((message) =>
      message.role === "user" ? new HumanMessage(message.content) : new AIMessage(message.content),
    );
}

/**
 * Streams the answer token by token. Using LCEL means the prompt, model and
 * output parser compose into one runnable that supports streaming, retries and
 * cancellation through the AbortSignal.
 */
export async function* streamAnswer({
  mode,
  question,
  history,
  passages,
  signal,
}: AnswerInput): AsyncGenerator<string> {
  if (mode.provider === "extractive") {
    yield extractiveAnswer(
      question,
      passages.map((passage) => passage.document),
    );
    return;
  }

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    new MessagesPlaceholder("history"),
    ["human", "CONTEXT EXCERPTS:\n{context}\n\nQUESTION: {question}"],
  ]);

  const chain = prompt.pipe(createChatModel(mode)).pipe(new StringOutputParser());
  const stream = await chain.stream(
    {
      history,
      context: buildContext(passages),
      question,
    },
    { signal },
  );

  for await (const chunk of stream) {
    if (signal.aborted) return;
    if (typeof chunk === "string" && chunk.length > 0) yield chunk;
  }
}
//checking commit