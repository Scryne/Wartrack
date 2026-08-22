import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Boots the built backend and drives it over real HTTP.
 *
 * The in-process suite mounts createApp() with supertest, which is close to
 * production but not identical: it never runs index.ts, so it cannot catch a
 * boot failure, a bad dotenv path, a missing native binding, or a route that
 * only breaks once helmet and compression are in the chain for real.
 *
 * Every assertion here is a security- or contract-relevant behaviour that was
 * an actual defect at some point. Run against a throwaway database.
 */

const PORT = Number(process.env.SMOKE_PORT ?? 3199);
const SECRET = process.env.API_SHARED_SECRET;
const BASE = `http://127.0.0.1:${PORT}`;

if (!SECRET) {
  console.error("[SMOKE] API_SHARED_SECRET must be set.");
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-smoke-"));
const dbPath = path.join(tmpDir, "smoke.db");

const server = spawn(process.execPath, ["dist/index.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: dbPath,
    BRIEF_MODEL_ENABLED: "0",
    // Keep the smoke run from reaching out to fifteen news sites in CI.
    DISABLE_SCHEDULED_FETCH: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

async function waitForBoot(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early with code ${server.exitCode}\n${serverLog}`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server did not become healthy in ${timeoutMs}ms\n${serverLog}`);
}

async function main() {
  console.log("[SMOKE] Waiting for boot…");
  await waitForBoot();
  console.log("[SMOKE] Running checks…");

  // ── Liveness and headers ────────────────────────────────────────────
  const health = await fetch(`${BASE}/api/health`);
  check("health returns 200", health.status === 200);
  check(
    "helmet sets X-Content-Type-Options",
    health.headers.get("x-content-type-options") === "nosniff"
  );
  check("X-Powered-By is suppressed", health.headers.get("x-powered-by") === null);

  // ── Error contract ──────────────────────────────────────────────────
  const notFound = await fetch(`${BASE}/api/does-not-exist`);
  const notFoundBody = await notFound.text();
  check("unknown API route returns 404", notFound.status === 404);
  check("unknown API route returns JSON, not HTML", !notFoundBody.includes("<!DOCTYPE html>"));

  const nonApi = await fetch(`${BASE}/not-an-api-path`);
  check("unknown non-API route also returns JSON", !(await nonApi.text()).includes("<!DOCTYPE"));

  const malformed = await fetch(`${BASE}/api/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": SECRET },
    body: "{not json"
  });
  const malformedBody = await malformed.text();
  check("malformed JSON returns 400", malformed.status === 400);
  check(
    "malformed JSON does not leak a stack trace",
    !/at .*node_modules/.test(malformedBody) && !malformedBody.includes("<!DOCTYPE html>"),
    malformedBody.slice(0, 120)
  );

  // ── Authentication ──────────────────────────────────────────────────
  const noKey = await fetch(`${BASE}/api/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 1, lng: 1, title: "x", description: "y", category: "info" })
  });
  check("write without a key returns 401", noKey.status === 401);

  const wrongKey = await fetch(`${BASE}/api/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "wrong-key-value-here" },
    body: JSON.stringify({ lat: 1, lng: 1, title: "x", description: "y", category: "info" })
  });
  check("write with a wrong key returns 401", wrongKey.status === 401);

  const openRead = await fetch(`${BASE}/api/feed?limit=1`);
  check("reads stay open without a key", openRead.status === 200);

  // ── Input validation ────────────────────────────────────────────────
  const badLimit = await fetch(`${BASE}/api/feed?limit=abc`);
  check("non-numeric limit returns 400", badLimit.status === 400);

  const arrayParam = await fetch(`${BASE}/api/feed?category[]=a&category[]=b`);
  check("repeated query parameter returns 400", arrayParam.status === 400);

  for (const [label, body] of [
    ["out-of-range latitude", { lat: 9999, lng: 0 }],
    ["null coordinates", { lat: null, lng: null }],
    ["hex-string latitude", { lat: "0x10", lng: 0 }]
  ]) {
    const res = await fetch(`${BASE}/api/pins`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": SECRET },
      body: JSON.stringify({ title: "x", description: "y", category: "info", ...body })
    });
    check(`${label} returns 400`, res.status === 400, `got ${res.status}`);
  }

  // ── A write that should succeed, read back ──────────────────────────
  const created = await fetch(`${BASE}/api/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": SECRET },
    body: JSON.stringify({
      lat: 32.1,
      lng: 36.7,
      title: "smoke pin",
      description: "ORIGINAL",
      category: "info"
    })
  });
  const createdBody = await created.json();
  check("valid write returns 201", created.status === 201, `got ${created.status}`);

  // Partial update must not erase the description.
  await fetch(`${BASE}/api/pins/${createdBody.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-API-Key": SECRET },
    body: JSON.stringify({ title: "smoke pin renamed", category: "strike" })
  });
  const listed = await (await fetch(`${BASE}/api/pins`)).json();
  const row = listed.find((pin) => pin.id === createdBody.id);
  check("partial update preserves the description", row?.description === "ORIGINAL", String(row?.description));
  check("partial update applied the new title", row?.title === "smoke pin renamed");

  // ── The server is still alive after all of that ─────────────────────
  const stillUp = await fetch(`${BASE}/api/health`);
  check("server survived every failure path", stillUp.status === 200);
  check("process has not exited", server.exitCode === null);
}

try {
  await main();
} catch (err) {
  console.error(`[SMOKE] ${err instanceof Error ? err.message : err}`);
  failures++;
} finally {
  server.kill("SIGTERM");
  // Give the graceful path a moment before forcing it.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (server.exitCode === null) server.kill("SIGKILL");
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n[SMOKE] ${failures} check(s) failed.\n--- server log ---\n${serverLog}`);
  process.exit(1);
}

console.log("\n[SMOKE] All checks passed.");
