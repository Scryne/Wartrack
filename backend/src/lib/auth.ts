import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Shared-secret authentication for mutating requests.
 *
 * This is a single-operator dashboard, so there are deliberately no accounts,
 * sessions or tokens — one shared secret, supplied as an X-API-Key header.
 *
 * Reads are left open: the backend binds to 0.0.0.0 for LAN/mobile access and
 * gating GETs would break every read path for no benefit here. Only POST/PUT/
 * PATCH/DELETE are gated, which is the boundary that matters (the write
 * endpoints are the destructive and cost-incurring ones).
 */

export const API_KEY_HEADER = "x-api-key";

/** Methods that can change server state or incur provider cost. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Short secrets are brute-forceable over a LAN; refuse them outright. */
const MIN_SECRET_LENGTH = 16;

/**
 * Values that are public knowledge and must never authenticate anything.
 *
 * .env.example used to ship a real 64-hex value so that copying it produced a
 * working setup. That is exactly the failure mode this check exists for: the
 * secret satisfied every length rule, the server booted reporting itself
 * authenticated, and anyone who had read the repository could write to it over
 * the LAN. Setup convenience is not worth a documented password.
 */
export const KNOWN_PLACEHOLDER_SECRETS = new Set([
  "6e2b1b3d2a3ac734e0c7a9b89967389351a9274b444ab3647590256619058687",
  "replace-me",
  "changeme",
  "your-secret-here",
  "yourkeyhere"
]);

/**
 * Read at request time, not module load, so tests can set it per suite.
 *
 * Trimmed, for two reasons that were both live defects:
 *
 *  1. `API_SHARED_SECRET=<24 spaces>` passed the length check, so the server
 *     booted announcing itself authenticated while holding a secret that can
 *     never match anything (requireApiKey trims the header, so the comparison
 *     value is ""). Every write then 401s with no diagnostic.
 *  2. A .env value with a trailing space — extremely easy to produce — made
 *     the *correct* key fail, because the header was trimmed and this was not.
 */
function getSharedSecret(): string {
  return (process.env.API_SHARED_SECRET ?? "").trim();
}

/**
 * Constant-time comparison. Hashing first gives both sides a fixed width, so
 * timingSafeEqual cannot throw on a length mismatch and the comparison does
 * not leak the secret's length.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedHash, expectedHash);
}

/**
 * Validate configuration at boot. Called from index.ts so the process refuses
 * to start unauthenticated rather than silently accepting every write.
 */
export function assertSharedSecretConfigured(): void {
  const secret = getSharedSecret();

  if (!secret) {
    throw new Error(
      "API_SHARED_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`), " +
        "add it to .env, and enter the same value in the dashboard under Settings."
    );
  }

  if (KNOWN_PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      "API_SHARED_SECRET is a known placeholder value from the repository and " +
        "is public. Generate a real one (`openssl rand -hex 32`) and put it in .env."
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `API_SHARED_SECRET must be at least ${MIN_SECRET_LENGTH} characters ` +
        `(got ${secret.length}).`
    );
  }
}

/**
 * Reject mutating requests without a valid X-API-Key.
 *
 * The response is a bare 401 with no detail: it does not distinguish "missing"
 * from "wrong", does not echo the supplied value, and does not reveal whether
 * the route exists.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  const expected = getSharedSecret();

  // Defence in depth: assertSharedSecretConfigured() already stops the server
  // from booting without a secret, so reaching here means something is wrong.
  // Fail closed rather than treating "" as a valid key.
  if (!expected) {
    console.error("[AUTH] API_SHARED_SECRET is not configured; rejecting write.");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const header = req.get(API_KEY_HEADER);
  const provided = typeof header === "string" ? header.trim() : "";

  if (!provided || !secretsMatch(provided, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}
