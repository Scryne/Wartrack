import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import apiRouter from "./routes";
import briefRouter from "./routes/brief";
import { runMigrations } from "./db/migrate";
import { registerJobs } from "./jobs";
import db from "./db";
import helmet from "helmet";
import compression from "compression";

// Handle uncaught exceptions to prevent completely ungraceful crashes in production
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Rejection at:", promise, "reason:", reason);
});

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const port = Number(process.env.PORT ?? 3001);

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

runMigrations();

const app = express();
const httpServer = http.createServer(app);

// Use security headers
app.use(helmet());
// Compress responses
app.use(compression());

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", ...ALLOWED_ORIGINS],
    credentials: true
  })
);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", ...ALLOWED_ORIGINS],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

app.use(express.json());
app.set("io", io);
app.use("/api", apiRouter);
app.use("/api/brief", briefRouter);

/* ── Health endpoint ── */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "3.0" });
});

/* ── Helper: compute init stats ── */
function getInitPayload() {
  const articles_count = (db.prepare("SELECT COUNT(*) as cnt FROM articles").get() as { cnt: number }).cnt;
  const events_count = (db.prepare("SELECT COUNT(*) as cnt FROM events WHERE createdAt > datetime('now', '-1 day')").get() as { cnt: number }).cnt;
  const pins_count = (db.prepare("SELECT COUNT(*) as cnt FROM pins").get() as { cnt: number }).cnt;
  const highSevCount = (db.prepare("SELECT COUNT(*) as cnt FROM events WHERE CAST(severity AS INTEGER) >= 4 AND createdAt > datetime('now', '-1 hour')").get() as { cnt: number }).cnt;
  let threat_level: 1 | 2 | 3 | 4 | 5 = 1;
  if (highSevCount > 10) threat_level = 5;
  else if (highSevCount > 5) threat_level = 4;
  else if (highSevCount > 2) threat_level = 3;
  else if (highSevCount > 0) threat_level = 2;

  return { articles_count, events_count, pins_count, threat_level };
}

io.on("connection", (socket) => {
  const payload = getInitPayload();
  socket.emit("init", payload);
});

registerJobs(io);

httpServer.listen(port);
