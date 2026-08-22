import fs from "fs";
import path from "path";

/**
 * Guards for invariants that a passing test suite would not otherwise protect.
 *
 * The question each of these answers is the one from an adversarial review:
 * "what could a developer change that every other gate would still let
 * through?" Type checking, unit tests and the API tests all keep passing if
 * someone deletes an asyncRoute() wrapper or drops the error handler — the
 * damage only shows up in production, as a hung request or a leaked stack.
 *
 * These are source-text assertions rather than behavioural ones because that
 * is what makes them cheap enough to be exhaustive over the whole route layer.
 * ESLint's no-misused-promises covers the same async-handler rule from the
 * type side; this covers it even if the lint gate is skipped or disabled.
 */

const SRC = path.resolve(__dirname, "../src");

function readSource(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), "utf8");
}

/**
 * Source with comments removed.
 *
 * Needed because several of these rules are *documented* in prose right next
 * to the code that upholds them — lib/time.ts's header says "Do not use
 * CURRENT_TIMESTAMP or datetime('now') anywhere in this codebase", which a
 * naive text scan reports as a violation of the very rule it states.
 */
function readCode(relative: string): string {
  return readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function listFiles(dir: string): string[] {
  const absolute = path.join(SRC, dir);
  return fs
    .readdirSync(absolute)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => path.join(dir, name));
}

describe("every async route handler is wrapped", () => {
  /**
   * Matches `router.post("/x", async (req, res) =>` — an async handler passed
   * straight to Express. Express 4 never awaits it, so a rejection leaves the
   * request hanging and reaches process-level unhandledRejection.
   *
   * asyncRoute(async (...)) does not match, because the `async` is preceded by
   * `asyncRoute(` rather than by the route path or a middleware argument.
   */
  const UNWRAPPED = /\.(get|post|put|patch|delete|use)\s*\(\s*[^)]*?(?<!asyncRoute\()\basync\s*\(/s;

  it.each(listFiles("routes"))("%s registers no bare async handler", (file) => {
    const source = readSource(file);

    // Strip asyncRoute(...) call openings so the regex cannot see inside them.
    const withoutWrapped = source.replace(/asyncRoute\(\s*async\s*\(/g, "asyncRoute(WRAPPED(");

    const offenders = withoutWrapped
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /\.(get|post|put|patch|delete)\(.*\basync\s*\(/.test(line));

    expect(
      offenders.map((o) => `${file}:${o.number}: ${o.line.trim()}`),
      "async handlers must be wrapped in asyncRoute() — see lib/http.ts"
    ).toEqual([]);

    // Belt and braces: the multiline form, where the handler starts on the
    // next line, is the one a line-by-line scan would miss.
    expect(UNWRAPPED.test(withoutWrapped.replace(/WRAPPED\(/g, "async ("))).toBe(false);
  });
});

describe("the app wiring keeps its safety layers", () => {
  const app = readCode("app.ts");

  it("mounts helmet, the JSON 404 and the error handler", () => {
    expect(app).toContain("helmet()");
    expect(app).toContain("notFoundHandler");
    expect(app).toContain("errorHandler");
  });

  it("registers the error handler after the routers and the 404", () => {
    // Express picks error middleware by arity and only reaches it if nothing
    // earlier ended the response, so ordering is behaviour, not tidiness.
    // Positions are taken from the app.use() calls, not from the identifiers,
    // which would otherwise match the import line at the top of the file.
    const code = readCode("app.ts");
    const routerMount = code.indexOf('app.use("/api", apiRouter)');
    const notFound = code.indexOf("app.use(notFoundHandler)");
    const errorLast = code.indexOf("app.use(errorHandler)");

    expect(routerMount).toBeGreaterThan(-1);
    expect(notFound).toBeGreaterThan(routerMount);
    expect(errorLast).toBeGreaterThan(notFound);
  });

  it("gates the API router behind requireApiKey", () => {
    // readCode, not readSource: commenting the line out left the substring in
    // the file, so a toContain() against the raw source passed while the gate
    // was disabled. Found by mutation-testing this guard.
    expect(readCode("routes/index.ts")).toContain("router.use(requireApiKey)");
    // briefRouter is mounted separately and needs its own gate.
    expect(readCode("routes/brief.ts")).toContain("briefRouter.use(requireApiKey)");
  });
});

describe("timestamps never regress to SQLite-native format", () => {
  it("no source file uses CURRENT_TIMESTAMP or datetime('now') outside migrations", () => {
    // Mixing "YYYY-MM-DD HH:MM:SS" with ISO-8601 silently breaks every TEXT
    // comparison, because ' ' sorts before 'T'. lib/time.ts exists to prevent
    // exactly this, but nothing stopped a new query from reintroducing it.
    const offenders: string[] = [];

    for (const dir of ["routes", "services", "lib", "jobs", "db"]) {
      for (const file of listFiles(dir)) {
        // migrate.ts legitimately references the legacy format while
        // converting away from it.
        if (file.endsWith("migrate.ts")) continue;
        if (/CURRENT_TIMESTAMP|datetime\('now'\)/.test(readCode(file))) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("coordinate validation exists on both write paths", () => {
  it("pins and events both range-check latitude and longitude", () => {
    // Events had these checks and pins did not, which is how lat=9999 and the
    // 0°,0° coercion got in. Asserting both keeps them from diverging again.
    for (const file of ["routes/pins.ts", "routes/events.ts"]) {
      const source = readSource(file);
      expect(source, `${file} must bound latitude`).toMatch(/-?90/);
      expect(source, `${file} must bound longitude`).toMatch(/-?180/);
    }
  });

  it("the pins table carries the constraint at the schema level too", () => {
    const migrations = readSource("db/migrate.ts");
    expect(migrations).toMatch(/CHECK\s*\(lat BETWEEN -90 AND 90\)/);
    expect(migrations).toMatch(/CHECK\s*\(lng BETWEEN -180 AND 180\)/);
  });
});

describe("migration versions stay unique and ordered", () => {
  it("declares no duplicate version and no gap in ordering", async () => {
    const { MIGRATION_VERSIONS } = await import("../src/db/migrate");

    expect(new Set(MIGRATION_VERSIONS).size).toBe(MIGRATION_VERSIONS.length);
    expect(MIGRATION_VERSIONS).toEqual([...MIGRATION_VERSIONS].sort((a, b) => a - b));
    // Contiguous from 1: a gap usually means a migration was deleted rather
    // than superseded, which leaves already-migrated databases inconsistent
    // with fresh ones.
    expect(MIGRATION_VERSIONS).toEqual(
      Array.from({ length: MIGRATION_VERSIONS.length }, (_, i) => i + 1)
    );
  });
});

describe("the shared secret has no development fallback", () => {
  it("never substitutes a default when API_SHARED_SECRET is absent", () => {
    const auth = readSource("lib/auth.ts");

    // A `?? "dev-secret"` style fallback is the classic way this becomes
    // fail-open: it works locally, so nobody notices it shipped.
    expect(auth).not.toMatch(/API_SHARED_SECRET\s*\?\?\s*["'][^"']{3,}["']/);
    expect(auth).toContain("KNOWN_PLACEHOLDER_SECRETS");
    expect(auth).toContain("timingSafeEqual");
  });
});
