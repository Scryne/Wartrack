import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * Refuses a commit that ships a credential or a database.
 *
 * This exists because it already happened: .env.example shipped a real 64-hex
 * API_SHARED_SECRET as a "throwaway placeholder". It satisfied every length
 * rule, so copying the file produced a server that reported itself
 * authenticated against a value published in the repository.
 *
 * Operates on git's index rather than the working tree — an ignored file on
 * someone's disk is not the problem; a tracked one is.
 */

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);

let failures = 0;

function fail(message) {
  console.error(`  ✗ ${message}`);
  failures++;
}

// ── Files that must never be tracked ──────────────────────────────────
const FORBIDDEN_PATTERNS = [
  { pattern: /(^|\/)\.env$/, why: "environment file with real values" },
  { pattern: /(^|\/)\.env\.(local|production|prod)$/, why: "environment file with real values" },
  { pattern: /\.db(-wal|-shm)?$/, why: "SQLite database" },
  { pattern: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, why: "private key" },
  { pattern: /\.(pem|pfx|p12|keystore)$/, why: "certificate or key material" }
];

for (const file of tracked) {
  for (const { pattern, why } of FORBIDDEN_PATTERNS) {
    if (pattern.test(file)) fail(`${file} is tracked (${why})`);
  }
}

// ── .env.example must not contain a usable secret ─────────────────────
if (fs.existsSync(".env.example")) {
  const lines = fs.readFileSync(".env.example", "utf8").split("\n");

  for (const line of lines) {
    const match = /^\s*([A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, name, , rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    if (!value) continue;

    // A long high-entropy-looking value in an example file is a real
    // credential, whatever the comment above it claims.
    if (/^[A-Fa-f0-9]{32,}$/.test(value) || /^[A-Za-z0-9+/_-]{32,}={0,2}$/.test(value)) {
      fail(`.env.example sets ${name} to what looks like a real credential`);
    }
  }
  console.log("  ✓ .env.example ships no usable credential");
} else {
  fail(".env.example is missing");
}

// ── Obvious hardcoded credentials in source ───────────────────────────
const SOURCE = tracked.filter(
  (file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file) && !file.includes("node_modules")
);

// Narrow on purpose: a broad "password" grep in a codebase full of auth
// comments produces noise, and a noisy gate gets switched off.
const HARDCODED = [
  { pattern: /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Fa-f0-9]{32,}["']/i, why: "hex credential literal" },
  { pattern: /AIza[0-9A-Za-z_-]{35}/, why: "Google API key" },
  { pattern: /sk-[A-Za-z0-9]{32,}/, why: "OpenAI-style key" },
  { pattern: /ghp_[A-Za-z0-9]{36}/, why: "GitHub token" }
];

for (const file of SOURCE) {
  const content = fs.readFileSync(file, "utf8");
  for (const { pattern, why } of HARDCODED) {
    // lib/auth.ts legitimately holds the known-placeholder denylist, which is
    // the opposite of a leak: those values exist to be rejected.
    if (file.endsWith("lib/auth.ts")) continue;
    if (pattern.test(content)) fail(`${file} appears to contain a ${why}`);
  }
}
console.log(`  ✓ scanned ${SOURCE.length} source files for credential literals`);

// ── .gitignore covers the sensitive paths ─────────────────────────────
if (fs.existsSync(".gitignore")) {
  const ignore = fs.readFileSync(".gitignore", "utf8");
  for (const entry of [".env", "*.db"]) {
    if (!ignore.includes(entry)) fail(`.gitignore does not cover ${entry}`);
  }
  console.log("  ✓ .gitignore covers .env and databases");
} else {
  fail(".gitignore is missing");
}

if (failures > 0) {
  console.error(`\n[SECRETS] ${failures} problem(s) found.`);
  process.exit(1);
}

console.log("\n[SECRETS] No committed credentials found.");
