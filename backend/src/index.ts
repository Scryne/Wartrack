import path from "path";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { createApp, resolveAllowedOrigins } from "./app";
import { registerJobs } from "./jobs";
import db from "./db";
import { sqliteIsoNow } from "./lib/time";
import { assertSharedSecretConfigured, isApiKeyValid } from "./lib/auth";

// After an uncaught exception the process state is undefined by Node's own
// contract: handles may be leaked and a transaction may be half-applied.
// Log and exit non-zero so a supervisor restarts us, rather than serving
// wrong answers from a corrupted process.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
  process.exit(1);
});

// Same reasoning, and deliberately still fatal. A rejection escaping to here
// means some promise had no error path at all, which is a bug we want loud.
//
// Route handlers no longer reach this: Express 4 does not catch an async
// handler's rejection, so before lib/http.ts's asyncRoute() wrapper existed,
// any failing DB read inside an async route killed the entire server. See the
// note there — this handler is now the backstop, not the primary path.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Refuse to start unauthenticated. This process binds to 0.0.0.0 for LAN and
// mobile access, so booting without a secret would expose every write endpoint.
try {
  assertSharedSecretConfigured();
} catch (err) {
  console.error(`[FATAL] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);

const ALLOWED_ORIGINS = resolveAllowedOrigins();

// Migrations run in db/index.ts at connection-open time, which is imported
// (and therefore executed) above before any route module prepares a statement.

const app = createApp(ALLOWED_ORIGINS);
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// Fail-closed handshake authentication for WebSocket connections
io.use((socket, next) => {
  const secret = (process.env.API_SHARED_SECRET ?? "").trim();
  if (!secret) return next();

  const authKey = socket.handshake.auth?.apiKey ?? socket.handshake.headers["x-api-key"];
  if (isApiKeyValid(authKey)) {
    return next();
  }

  // Reject unauthenticated socket connections
  const authErr = new Error("Unauthorized Socket.IO Connection");
  return next(authErr);
});

app.set("io", io);

// NOTE: /api/health is served by apiRouter (routes/index.ts). A second
// app.get("/api/health") here was unreachable, since app.use("/api", ...)
// in createApp matches first.

/* ── Helper: compute init stats ── */
// Prepared once at module scope, not per connection: better-sqlite3 compiles
// on prepare(), and these four ran on every socket handshake.
const countArticlesStmt = db.prepare("SELECT COUNT(*) as cnt FROM articles");
const countRecentEventsStmt = db.prepare(
  `SELECT COUNT(*) as cnt FROM events WHERE createdAt > ${sqliteIsoNow("-1 day")}`
);
const countPinsStmt = db.prepare("SELECT COUNT(*) as cnt FROM pins");
const countHighSeverityStmt = db.prepare(
  `SELECT COUNT(*) as cnt FROM events
    WHERE CAST(severity AS INTEGER) >= 4 AND createdAt > ${sqliteIsoNow("-1 hour")}`
);

function getInitPayload() {
  const articles_count = (countArticlesStmt.get() as { cnt: number }).cnt;
  const events_count = (countRecentEventsStmt.get() as { cnt: number }).cnt;
  const pins_count = (countPinsStmt.get() as { cnt: number }).cnt;
  const highSevCount = (countHighSeverityStmt.get() as { cnt: number }).cnt;
  let threat_level: 1 | 2 | 3 | 4 | 5 = 1;
  if (highSevCount > 10) threat_level = 5;
  else if (highSevCount > 5) threat_level = 4;
  else if (highSevCount > 2) threat_level = 3;
  else if (highSevCount > 0) threat_level = 2;

  return { articles_count, events_count, pins_count, threat_level };
}

io.on("connection", (socket) => {
  // A throw inside a Socket.IO connection handler is an uncaughtException,
  // which the handler above turns into process.exit(1). One client connecting
  // while the database is momentarily locked must not take the server down;
  // the dashboard re-fetches these counts over HTTP anyway.
  try {
    socket.emit("init", getInitPayload());
  } catch (err) {
    console.error("[SOCKET] init payload failed:", err);
  }
});

registerJobs(io);

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[FATAL] Port ${port} is already in use.`);
  } else {
    console.error("[FATAL] HTTP server error:", err);
  }
  process.exit(1);
});

httpServer.listen(port, () => {
  console.info(`[HTTP] WARTRACKER backend listening on :${port}`);
});

/**
 * Graceful shutdown.
 *
 * SQLite in WAL mode leaves -wal/-shm sidecars behind when the process is
 * killed mid-write; db.close() checkpoints and removes them. Stopping the
 * HTTP server first lets in-flight requests finish instead of having their
 * connections cut.
 *
 * Windows caveat: Node can listen for SIGTERM but nothing on Windows delivers
 * it, and Git Bash's `kill` terminates the process outright. This path
 * therefore only runs under a real supervisor (systemd, Docker, pm2). An
 * abrupt kill is still safe — WAL writes are committed and fsynced, so the
 * sidecars are recovered on next open — it just skips the checkpoint.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[HTTP] ${signal} received, shutting down.`);

  // Fail-safe: if a hung connection keeps the server from closing, exit anyway
  // rather than hanging until the supervisor sends SIGKILL.
  const forceExit = setTimeout(() => {
    console.error("[HTTP] Shutdown timed out; forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    // Awaited. io.close() returns a promise that resolves once every socket is
    // disconnected, and it also closes the HTTP server it was attached to.
    // Firing it without awaiting raced Socket.IO's teardown against the
    // httpServer.close() below, so db.close() could run while sockets were
    // still being torn down.
    await io.close();
  } catch (err) {
    console.error("[SOCKET] Close failed:", err);
  }

  await new Promise<void>((resolve) => {
    httpServer.close((err) => {
      // io.close() has usually closed it already; ERR_SERVER_NOT_RUNNING here
      // is the expected case, not a problem.
      if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        console.error("[HTTP] Close failed:", err);
      }
      resolve();
    });
  });

  try {
    db.close();
  } catch (err) {
    console.error("[DB] Close failed:", err);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
