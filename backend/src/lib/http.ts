import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Error plumbing for an Express 4 app.
 *
 * Express 4 predates promises: it only forwards an error to the error-handling
 * middleware when a handler throws *synchronously* or calls next(err). An
 * `async` handler that rejects does neither — Express never sees the rejection,
 * so the response is never sent and the request hangs until the client times
 * out. The rejection then surfaces as an unhandledRejection, which index.ts
 * treats as fatal and turns into process.exit(1).
 *
 * That combination means one failing DB read inside any async route takes the
 * whole server down. asyncRoute() closes that path by adapting the promise to
 * the callback contract Express does understand.
 */

/**
 * Wrap an async handler so a rejection reaches the error middleware.
 *
 * Every `async` route handler must go through this. A synchronous handler does
 * not need it (Express already catches those), but wrapping one is harmless.
 */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * JSON 404 for unmatched /api routes; the default handler returns an HTML page.
 *
 * originalUrl, not path: this is mounted under /api, and req.path is relative
 * to the mount point, so it reported "GET /nope" for a request to /api/nope.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

/**
 * Terminal error handler.
 *
 * Express's built-in handler renders the stack trace into the response body
 * whenever NODE_ENV is not "production" — which is the default, since nothing
 * in this project sets it. That leaks absolute source paths and internal call
 * chains to any client that can provoke an error, including through a
 * malformed JSON body. This one logs the detail server-side and returns a
 * fixed shape.
 *
 * Must be registered last, and must keep all four parameters: Express
 * identifies error middleware by arity, so dropping `next` silently demotes it
 * to an ordinary handler that never runs.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? (err as { status: number }).status
      : typeof (err as { statusCode?: unknown })?.statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;

  console.error(`[HTTP] ${req.method} ${req.originalUrl} failed:`, err);

  // Headers already flushed: the response is committed and the only correct
  // action left is to abort it, otherwise Express appends to a sent body.
  if (res.headersSent) {
    res.destroy();
    return;
  }

  // 4xx come from client input (body-parser's malformed-JSON error, say) and
  // are safe to name. 5xx are internal and get a fixed string.
  const message =
    status >= 400 && status < 500 && err instanceof Error
      ? err.message
      : "Internal server error.";

  res.status(status).json({ message });
}
