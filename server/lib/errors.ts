export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class EmbeddingMismatchError extends HttpError {
  constructor(
    message = "This source was indexed with a different embedding model. Re-upload it to chat again.",
  ) {
    super(409, message);
    this.name = "EmbeddingMismatchError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}
