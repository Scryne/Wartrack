import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import apiRouter from "./routes";
import briefRouter from "./routes/brief";
import { API_KEY_HEADER } from "./lib/auth";
import { errorHandler, notFoundHandler } from "./lib/http";

/**
 * Builds the Express app.
 *
 * Extracted from index.ts so the test suite mounts the *same* middleware stack
 * the server runs. The tests previously assembled their own app with only
 * express.json() and the routers, which meant helmet, compression, the JSON
 * 404 and the error handler were untested — and a middleware-ordering bug
 * could not fail a test.
 *
 * index.ts keeps everything that is process-level rather than request-level:
 * the HTTP server, Socket.IO, cron registration and listen().
 */
export function createApp(allowedOrigins: string[]): Express {
  const app = express();

  // Off by default. The rate limiters key on req.ip, which without this is the
  // socket address — behind the TLS-terminating proxy the README suggests,
  // that is the proxy for every client, so one caller's burst would throttle
  // everyone. Enabling it makes Express read X-Forwarded-For instead.
  //
  // Deliberately opt-in: with no real proxy in front, a client can set
  // X-Forwarded-For freely and give itself a fresh rate-limit bucket per
  // request. Only set TRUST_PROXY when something upstream actually rewrites
  // that header.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    // Numeric hop counts are the common case ("1" for a single proxy); any
    // other value is passed through as an Express trust-proxy expression.
    const hops = Number(trustProxy);
    app.set("trust proxy", Number.isInteger(hops) && hops > 0 ? hops : trustProxy);
  }

  app.use(helmet());
  app.use(compression());

  // Correlation & Request Tracing Middleware
  app.use((req, res, next) => {
    const rawReqId = req.headers["x-request-id"];
    const requestId = typeof rawReqId === "string" && rawReqId.trim().length > 0
      ? rawReqId.trim().slice(0, 64)
      : crypto.randomUUID();
    (req as express.Request & { id?: string }).id = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      // X-API-Key and X-Request-Id are allowed headers
      allowedHeaders: ["Content-Type", API_KEY_HEADER, "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"]
    })
  );

  app.use(express.json());

  app.use("/api", apiRouter);
  app.use("/api/brief", briefRouter);

  // Order matters and is load-bearing: the 404 catches anything the routers did
  // not match, and the error handler must be last so every earlier layer —
  // including express.json()'s malformed-body error — lands here rather than in
  // Express's stack-trace-leaking default.
  //
  // Unmounted (not app.use("/api", ...)): this process serves only the API, and
  // scoping it to /api left every other path falling through to Express's HTML
  // "Cannot GET /x" page — a different content type for the same class of
  // answer.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** The origins allowed for both CORS and the Socket.IO handshake. */
export function resolveAllowedOrigins(): string[] {
  return Array.from(
    new Set(
      ["http://localhost:5173", "http://127.0.0.1:5173", process.env.FRONTEND_URL].filter(
        Boolean
      ) as string[]
    )
  );
}
