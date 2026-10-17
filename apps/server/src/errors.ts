/** An error with an HTTP status and a stable `code` the dashboard can translate. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
