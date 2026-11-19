/** Error with an HTTP status and stable machine-readable code, surfaced by route handlers. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
