import fs from "fs/promises";
import { type Express } from "express";
import request from "supertest";

// Unique per run so a leaked file from a previous run can never leak state in.
const TEST_DB_RELATIVE_PATH = `./wartracker.test.${process.pid}.db`;
/** Must be >= 16 chars; assertSharedSecretConfigured() enforces that. */
const TEST_SECRET = "test-shared-secret-0123456789";

let app: Express;

beforeAll(async () => {
  process.env.DB_PATH = TEST_DB_RELATIVE_PATH;
  process.env.BRIEF_MODEL_ENABLED = "0";
  process.env.API_SHARED_SECRET = TEST_SECRET;

  // Importing db opens the connection and runs migrations.
  await import("../src/db");

  // The same factory index.ts uses. This suite used to hand-assemble an app
  // out of express.json() plus the routers, so helmet, the JSON 404 and the
  // error handler were never exercised — a middleware-ordering bug could not
  // fail a test here.
  const { createApp } = await import("../src/app");
  app = createApp(["http://localhost:5173"]);
  app.set("io", { emit: () => undefined });
});

afterAll(async () => {
  // DATABASE_PATH is the path db/index.ts actually opened. The previous code
  // recomputed it from __dirname and unlinked backend/wartracker.test.db,
  // which never existed, so every run leaked its database into the repo root.
  const { default: db, DATABASE_PATH } = await import("../src/db");
  db.close();

  await fs.unlink(DATABASE_PATH);
  for (const suffix of ["-wal", "-shm"]) {
    await fs.unlink(`${DATABASE_PATH}${suffix}`).catch((err) => {
      // WAL sidecars are absent after a clean close; anything else is real.
      if (err.code !== "ENOENT") throw err;
    });
  }
});

describe("backend api smoke", () => {
  it("returns health payload", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe("wartracker-backend");
  });

  it("returns feed with pagination envelope", async () => {
    const response = await request(app).get("/api/feed?limit=5");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(typeof response.body.total).toBe("number");
    expect(response.body.limit).toBe(5);
  });

  it("updates settings and reads updated values", async () => {
    const putResponse = await request(app).put("/api/settings/ai.interval").set("X-API-Key", TEST_SECRET).send({ value: "3" });
    const getResponse = await request(app).get("/api/settings");

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.ok).toBe(true);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body["ai.interval"]).toBe("3");
  });

  it("supports pin create update delete flow", async () => {
    const uniqueTitle = `Pin-${Date.now()}`;

    const createResponse = await request(app).post("/api/pins").set("X-API-Key", TEST_SECRET).send({
      lat: 32.1,
      lng: 36.7,
      title: uniqueTitle,
      description: "test pin",
      category: "strike"
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.title).toBe(uniqueTitle);

    const pinId = Number(createResponse.body.id);
    expect(Number.isInteger(pinId)).toBe(true);

    const updateResponse = await request(app).put(`/api/pins/${pinId}`).set("X-API-Key", TEST_SECRET).send({
      title: `${uniqueTitle}-updated`,
      description: "updated pin",
      category: "movement"
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.success).toBe(true);

    const listResponse = await request(app).get("/api/pins");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.some((pin: { id: number }) => pin.id === pinId)).toBe(true);

    const deleteResponse = await request(app).delete(`/api/pins/${pinId}`).set("X-API-Key", TEST_SECRET);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
  });
});

describe("shared-secret auth on write endpoints", () => {
  const WRITES: Array<[string, string, Record<string, unknown> | undefined]> = [
    ["post", "/api/pins", { lat: 1, lng: 1, title: "x", description: "y", category: "info" }],
    ["put", "/api/pins/1", { title: "x", description: "y", category: "info" }],
    ["delete", "/api/pins/1", undefined],
    ["post", "/api/events", { type: "genel", title: "x" }],
    ["delete", "/api/events/1", undefined],
    ["post", "/api/bookmarks", { articleId: 1 }],
    ["delete", "/api/bookmarks/1", undefined],
    ["put", "/api/settings/ai.model", { value: "ollama" }],
    ["put", "/api/settings", { "ai.model": "ollama" }],
    ["post", "/api/feed/refresh", undefined],
    ["post", "/api/summarize/rebuild", undefined],
    ["post", "/api/brief", { force: false }]
  ];

  it.each(WRITES)("%s %s rejects a request with no key", async (method, path, body) => {
    const req = (request(app) as any)[method](path);
    const res = await (body ? req.send(body) : req);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it.each(WRITES)("%s %s rejects an incorrect key", async (method, path, body) => {
    const req = (request(app) as any)[method](path).set("X-API-Key", "wrong-secret-value-here");
    const res = await (body ? req.send(body) : req);

    expect(res.status).toBe(401);
  });

  it("accepts a write carrying the correct key", async () => {
    const res = await request(app)
      .post("/api/pins")
      .set("X-API-Key", TEST_SECRET)
      .send({ lat: 10, lng: 20, title: "authed", description: "d", category: "info" });

    expect(res.status).toBe(201);

    await request(app).delete(`/api/pins/${res.body.id}`).set("X-API-Key", TEST_SECRET);
  });

  it("does not leak whether the key was missing, wrong, or the route exists", async () => {
    const missing = await request(app).post("/api/pins").send({});
    const wrong = await request(app).post("/api/pins").set("X-API-Key", "nope").send({});
    const bogusRoute = await request(app).post("/api/does-not-exist").set("X-API-Key", "nope");

    expect(missing.body).toEqual({ error: "Unauthorized" });
    expect(wrong.body).toEqual({ error: "Unauthorized" });
    expect(bogusRoute.status).toBe(401);
    expect(JSON.stringify(missing.body)).not.toContain("nope");
  });

  it("leaves GET endpoints open", async () => {
    for (const path of [
      "/api/health",
      "/api/feed?limit=1",
      "/api/feed/sources",
      "/api/feed/health",
      "/api/feed/map-pins",
      "/api/pins",
      "/api/events",
      "/api/events/stats",
      "/api/settings",
      "/api/bookmarks",
      "/api/summarize/status",
      "/api/summarize/latest"
    ]) {
      const res = await request(app).get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it("rejects a key that only shares a prefix with the secret", async () => {
    const res = await request(app)
      .post("/api/pins")
      .set("X-API-Key", TEST_SECRET.slice(0, TEST_SECRET.length - 1))
      .send({ lat: 1, lng: 1, title: "x", description: "y", category: "info" });

    expect(res.status).toBe(401);
  });
});

describe("assertSharedSecretConfigured", () => {
  it("rejects a missing or too-short secret and accepts a valid one", async () => {
    const { assertSharedSecretConfigured } = await import("../src/lib/auth");
    const original = process.env.API_SHARED_SECRET;

    try {
      delete process.env.API_SHARED_SECRET;
      expect(() => assertSharedSecretConfigured()).toThrow(/not set/i);

      process.env.API_SHARED_SECRET = "tooshort";
      expect(() => assertSharedSecretConfigured()).toThrow(/at least 16/i);

      process.env.API_SHARED_SECRET = TEST_SECRET;
      expect(() => assertSharedSecretConfigured()).not.toThrow();
    } finally {
      process.env.API_SHARED_SECRET = original;
    }
  });
});

describe("POST /api/events validation (D9)", () => {
  it("rejects out-of-range severity", async () => {
    const res = await request(app)
      .post("/api/events").set("X-API-Key", TEST_SECRET)
      .send({ type: "kritik", title: "Test", severity: 99 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/severity/i);
  });

  it("rejects out-of-range coordinates", async () => {
    const res = await request(app)
      .post("/api/events").set("X-API-Key", TEST_SECRET)
      .send({ type: "kritik", title: "Test", lat: 999, lng: 0 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lat/i);
  });

  it("rejects lat without lng", async () => {
    const res = await request(app)
      .post("/api/events").set("X-API-Key", TEST_SECRET)
      .send({ type: "kritik", title: "Test", lat: 32.1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/together/i);
  });

  it("accepts a valid payload and auto-detects severity from the title", async () => {
    const res = await request(app)
      .post("/api/events").set("X-API-Key", TEST_SECRET)
      .send({ type: "kritik", title: "Ballistic missile intercepted", lat: 32.1, lng: 36.7 });

    expect(res.status).toBe(201);
    // KEYWORD_SEVERITY maps ballistic/missile/intercept to 4.
    expect(res.body.severity).toBe("4");
    expect(res.body.lat).toBe(32.1);
  });

  it("stores createdAt in ISO-8601 UTC", async () => {
    const res = await request(app)
      .post("/api/events").set("X-API-Key", TEST_SECRET)
      .send({ type: "genel", title: "Nuclear reactor inspection" });

    expect(res.status).toBe(201);
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Math.abs(Date.parse(res.body.createdAt) - Date.now())).toBeLessThan(60_000);
  });
});

describe("settings key allowlist (D9)", () => {
  it("rejects an unknown key", async () => {
    const res = await request(app).put("/api/settings/evil.key").set("X-API-Key", TEST_SECRET).send({ value: "x" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unknown setting key/);
  });

  it("rejects an out-of-range scheduler interval", async () => {
    const res = await request(app).put("/api/settings/rss.interval").set("X-API-Key", TEST_SECRET).send({ value: "9999" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/between 1 and 60/);
  });

  it("rejects an invalid ai.model", async () => {
    const res = await request(app).put("/api/settings/ai.model").set("X-API-Key", TEST_SECRET).send({ value: "gpt" });
    expect(res.status).toBe(400);
  });

  it("applies bulk updates atomically, rejecting the whole body on a bad key", async () => {
    const before = await request(app).get("/api/settings");
    const originalModel = before.body["ai.model"];

    const res = await request(app)
      .put("/api/settings").set("X-API-Key", TEST_SECRET)
      .send({ "ai.model": "gemini", "evil.key": "x" });

    expect(res.status).toBe(400);

    const after = await request(app).get("/api/settings");
    expect(after.body["ai.model"]).toBe(originalModel);
  });
});

describe("POST /api/brief rule-based output (D19)", () => {
  it("never emits duplicate bullets in a section", async () => {
    const res = await request(app).post("/api/brief").set("X-API-Key", TEST_SECRET).send({ force: true });

    expect(res.status).toBe(200);
    const bullets = String(res.body.brief)
      .split("\n")
      .filter((line) => line.startsWith("- "));

    expect(bullets.length).toBeGreaterThan(0);
    expect(new Set(bullets).size).toBe(bullets.length);
  });
});

describe("async route failures do not hang or crash the process", () => {
  /**
   * Express 4 does not catch an async handler's rejection: it never calls the
   * error middleware, so the response is never sent and the request hangs
   * until the client gives up. The rejection then becomes an
   * unhandledRejection, which index.ts turns into process.exit(1) — one
   * failing DB read inside any async route took the whole server down.
   *
   * lib/http.ts's asyncRoute() is what closes that. This test asserts the
   * wrapper's contract directly, because reproducing the crash in-process
   * would kill the test runner.
   */
  it("asyncRoute forwards a rejection to the error handler instead of leaking it", async () => {
    const express = (await import("express")).default;
    const { asyncRoute, errorHandler } = await import("../src/lib/http");

    const probe = express();
    probe.get(
      "/boom",
      // eslint-disable-next-line @typescript-eslint/require-await -- the point is that it rejects
      asyncRoute(async () => {
        throw new Error("STACK_MARKER_SHOULD_NOT_LEAK");
      })
    );
    probe.use(errorHandler);

    const res = await request(probe).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal server error." });
    expect(res.text).not.toContain("STACK_MARKER_SHOULD_NOT_LEAK");
  });

  it("Express 4 ignores what an async handler returns, which is why the wrapper exists", async () => {
    const express = (await import("express")).default;
    const { errorHandler } = await import("../src/lib/http");

    const probe = express();

    // A handler that returns a promise which never settles. This demonstrates
    // the same mechanism as a rejecting one — Express neither awaits the
    // returned value nor routes it to the error middleware, so the response is
    // never sent — but without actually producing an unhandled rejection.
    //
    // The rejecting version was the obvious way to write this and was wrong:
    // it made a real unhandled rejection that Vitest reported as an unhandled
    // error, which fails the whole run with exit code 1 even though all
    // assertions passed. Worth remembering that "147 passed" and "the test
    // command succeeded" are not the same statement.
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    probe.get("/never", () => new Promise<void>(() => undefined));
    probe.use(errorHandler);

    const outcome = await request(probe)
      .get("/never")
      .timeout({ deadline: 700 })
      .then(() => "responded")
      .catch(() => "hung");

    // If Express ever starts adopting handler promises, this flips to
    // "responded" and asyncRoute can be reconsidered.
    expect(outcome).toBe("hung");
  });
});

describe("error responses do not leak internals", () => {
  it("returns JSON, not an HTML stack trace, for a malformed body", async () => {
    const res = await request(app)
      .post("/api/pins")
      .set("X-API-Key", TEST_SECRET)
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.text).not.toContain("<!DOCTYPE html>");
    // An absolute source path is the specific thing the default handler leaked.
    expect(res.text).not.toMatch(/at .*[\\/]node_modules[\\/]/);
    expect(typeof res.body.message).toBe("string");
  });

  it("returns a JSON 404 for an unknown /api route", async () => {
    const res = await request(app).get("/api/definitely-not-a-route");

    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.body.message).toMatch(/not found/i);
  });

  it("sets the helmet security headers the server runs with", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    // helmet removes this; its presence would advertise the stack.
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("malformed query parameters are 400, not 500 or a wrong answer", () => {
  it("rejects a non-numeric limit instead of binding NaN", async () => {
    // Number("abc") is NaN, which SQLite binds as NULL. `LIMIT NULL` means
    // "no limit", so this used to be either a 500 or an unbounded scan.
    const res = await request(app).get("/api/feed?limit=abc");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/limit/i);
  });

  it.each([
    ["/api/feed?limit[]=1&limit[]=2", "limit"],
    ["/api/feed?category[]=a&category[]=b", "category"],
    ["/api/events?severity[]=1&severity[]=2", "severity"]
  ])("rejects a repeated parameter: %s", async (path, name) => {
    // qs turns ?x[]=1&x[]=2 into an array, so a client controls the *type*.
    // better-sqlite3 then threw "can only bind numbers, strings, ..." -> 500.
    const res = await request(app).get(path);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(new RegExp(name, "i"));
  });

  it("rejects a non-numeric minSeverity instead of silently matching nothing", async () => {
    // `severity >= NULL` is never true, so this returned an empty list with a
    // 200 — indistinguishable from "there are no such events".
    const res = await request(app).get("/api/events?minSeverity=abc");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/minSeverity/i);
  });

  it("clamps a negative summary limit rather than passing LIMIT -5", async () => {
    // SQLite reads a negative LIMIT as "no limit".
    const res = await request(app).get("/api/summarize/latest?limit=-5");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("rejects a NaN event id rather than reporting it as not found", async () => {
    const res = await request(app).delete("/api/events/abc").set("X-API-Key", TEST_SECRET);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });
});

describe("feed search treats the query as literal text", () => {
  it("does not let a LIKE wildcard match everything", async () => {
    const { default: db } = await import("../src/db");
    db.prepare(
      `INSERT OR IGNORE INTO articles (guid, title, link, pubDate, source, category)
       VALUES ('like-1','Inflation hit 100% this year','https://e.test/l1',
               '2026-08-07T10:00:00.000Z','BBC World','haber'),
              ('like-2','Unrelated headline','https://e.test/l2',
               '2026-08-07T10:00:00.000Z','BBC World','haber')`
    ).run();

    // Pre-fix the trailing % was a wildcard, so "100%" matched both rows —
    // the search silently answered a different question than the one asked.
    const res = await request(app).get("/api/feed?search=100%25");

    expect(res.status).toBe(200);
    const titles = res.body.data.map((a: { title: string }) => a.title);
    expect(titles).toContain("Inflation hit 100% this year");
    expect(titles).not.toContain("Unrelated headline");
  });

  it("treats a bare % as text that matches nothing rather than as 'all rows'", async () => {
    const res = await request(app).get("/api/feed?search=%25%25%25");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("pin coordinate validation", () => {
  const base = { title: "coord test", description: "d", category: "info" };

  it.each([
    ["lat above 90", { ...base, lat: 9999, lng: 0 }],
    ["lng below -180", { ...base, lat: 0, lng: -99999 }],
    // Number(null) and Number("") are both 0, so these used to land a pin at
    // 0°,0° in the Gulf of Guinea and return 201.
    ["null coordinates", { ...base, lat: null, lng: null }],
    ["empty-string coordinates", { ...base, lat: "", lng: "" }],
    ["missing coordinates", base],
    ["array coordinates", { ...base, lat: [5], lng: [6] }]
  ])("rejects %s", async (_label, body) => {
    const res = await request(app).post("/api/pins").set("X-API-Key", TEST_SECRET).send(body);

    expect(res.status).toBe(400);
  });

  it("still accepts a genuine coordinate, including numeric strings", async () => {
    const res = await request(app)
      .post("/api/pins")
      .set("X-API-Key", TEST_SECRET)
      .send({ ...base, lat: "32.1", lng: "36.7" });

    expect(res.status).toBe(201);
    expect(res.body.lat).toBe(32.1);

    await request(app).delete(`/api/pins/${res.body.id}`).set("X-API-Key", TEST_SECRET);
  });

  it("rejects a hex-, octal- or binary-literal coordinate", async () => {
    // Number("0x10") is 16, so "0x10" was accepted and stored as latitude 16 —
    // a coordinate the sender plainly did not intend, within valid range and
    // therefore invisible to the bounds check.
    for (const lat of ["0x10", "0b1010", "0o17"]) {
      const res = await request(app)
        .post("/api/pins")
        .set("X-API-Key", TEST_SECRET)
        .send({ ...base, lat, lng: 10 });

      expect({ lat, status: res.status }).toEqual({ lat, status: 400 });
    }
  });

  it("still accepts exponent notation, which is a normal way to write a number", async () => {
    const res = await request(app)
      .post("/api/pins")
      .set("X-API-Key", TEST_SECRET)
      .send({ ...base, lat: "3.21e1", lng: "3.67e1" });

    expect(res.status).toBe(201);
    expect(res.body.lat).toBe(32.1);

    await request(app).delete(`/api/pins/${res.body.id}`).set("X-API-Key", TEST_SECRET);
  });

  it("rejects an over-long title instead of storing it unbounded", async () => {
    const res = await request(app)
      .post("/api/pins")
      .set("X-API-Key", TEST_SECRET)
      .send({ ...base, lat: 1, lng: 1, title: "T".repeat(50_000) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });
});

describe("pin updates do not lose data", () => {
  it("keeps the stored description when the field is omitted", async () => {
    const created = await request(app).post("/api/pins").set("X-API-Key", TEST_SECRET).send({
      lat: 32.1,
      lng: 36.7,
      title: "keeps description",
      description: "ORIGINAL_DESCRIPTION",
      category: "info"
    });
    expect(created.status).toBe(201);

    // A partial update: title and category only. This used to fall through to
    // description = "" and silently erase the stored value with a 200.
    const updated = await request(app)
      .put(`/api/pins/${created.body.id}`)
      .set("X-API-Key", TEST_SECRET)
      .send({ title: "renamed", category: "strike" });
    expect(updated.status).toBe(200);

    const list = await request(app).get("/api/pins");
    const row = list.body.find((pin: { id: number }) => pin.id === created.body.id);

    expect(row.title).toBe("renamed");
    expect(row.description).toBe("ORIGINAL_DESCRIPTION");

    await request(app).delete(`/api/pins/${created.body.id}`).set("X-API-Key", TEST_SECRET);
  });

  it("still clears the description when one is explicitly sent empty", async () => {
    const created = await request(app).post("/api/pins").set("X-API-Key", TEST_SECRET).send({
      lat: 1,
      lng: 1,
      title: "explicit clear",
      description: "GOES_AWAY",
      category: "info"
    });

    await request(app)
      .put(`/api/pins/${created.body.id}`)
      .set("X-API-Key", TEST_SECRET)
      .send({ title: "explicit clear", category: "info", description: "" });

    const list = await request(app).get("/api/pins");
    const row = list.body.find((pin: { id: number }) => pin.id === created.body.id);

    expect(row.description).toBe("");

    await request(app).delete(`/api/pins/${created.body.id}`).set("X-API-Key", TEST_SECRET);
  });
});

describe("bookmarks report client errors as client errors", () => {
  it("returns 404 for an article that does not exist", async () => {
    // OR IGNORE does not suppress foreign-key violations, only uniqueness
    // ones, so this threw and surfaced as a 500.
    const res = await request(app)
      .post("/api/bookmarks")
      .set("X-API-Key", TEST_SECRET)
      .send({ articleId: 987_654 });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("reports whether a delete actually removed anything", async () => {
    const res = await request(app).delete("/api/bookmarks/987654").set("X-API-Key", TEST_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(false);
  });
});

describe("configuration that must not authenticate anything", () => {
  it("rejects every known placeholder, including the one .env.example shipped", async () => {
    const { assertSharedSecretConfigured, KNOWN_PLACEHOLDER_SECRETS } = await import(
      "../src/lib/auth"
    );
    const original = process.env.API_SHARED_SECRET;

    try {
      // Imported rather than written out: duplicating the literal here made
      // the CI secret-hygiene scanner flag this file as leaking a credential,
      // and iterating the real set also covers placeholders added later.
      for (const placeholder of KNOWN_PLACEHOLDER_SECRETS) {
        process.env.API_SHARED_SECRET = placeholder;
        expect(
          () => assertSharedSecretConfigured(),
          `${placeholder} must be refused`
        ).toThrow(/placeholder|at least/i);
      }
    } finally {
      process.env.API_SHARED_SECRET = original;
    }
  });

  it("rejects a whitespace-only secret rather than booting with an unusable one", async () => {
    const { assertSharedSecretConfigured } = await import("../src/lib/auth");
    const original = process.env.API_SHARED_SECRET;

    try {
      // 24 spaces passed the length check, so the server started announcing
      // itself authenticated while holding a secret that can never match:
      // requireApiKey trims the incoming header, so the comparison value is "".
      process.env.API_SHARED_SECRET = " ".repeat(24);
      expect(() => assertSharedSecretConfigured()).toThrow(/not set/i);
    } finally {
      process.env.API_SHARED_SECRET = original;
    }
  });

  it("accepts a correct key even when the configured value has stray whitespace", async () => {
    const original = process.env.API_SHARED_SECRET;

    try {
      // A trailing space in .env is trivially easy to produce, and made the
      // *correct* key 401 because the header was trimmed and this was not.
      process.env.API_SHARED_SECRET = `  ${TEST_SECRET}  `;

      const res = await request(app)
        .post("/api/pins")
        .set("X-API-Key", TEST_SECRET)
        .send({ lat: 1, lng: 1, title: "ws", description: "d", category: "info" });

      expect(res.status).toBe(201);
      await request(app).delete(`/api/pins/${res.body.id}`).set("X-API-Key", TEST_SECRET);
    } finally {
      process.env.API_SHARED_SECRET = original;
    }
  });
});

describe("feed metrics (D25)", () => {
  it("reports a real success rate alongside the circuit-breaker rate", async () => {
    const res = await request(app).get("/api/feed/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("feed_circuit_closed_rate");
    expect(res.body).toHaveProperty("feed_fetch_attempt_total");
    expect(res.body).toHaveProperty("feed_fetch_success_total");
    // No fetches attempted in this suite, so the closed-circuit rate is 100%
    // while the success rate is defined as 100% only because attempts === 0.
    expect(res.body.feed_circuit_closed_rate).toBe(100);
    expect(res.body.feed_fetch_attempt_total).toBe(0);
  });
});

describe("backup routes (/api/backup)", () => {
  it("GET /api/backup/list returns a list of available backups", async () => {
    const res = await request(app).get("/api/backup/list");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.backups)).toBe(true);
  });

  it("POST /api/backup/create generates a consistent snapshot with API key", async () => {
    const res = await request(app)
      .post("/api/backup/create")
      .set("X-API-Key", TEST_SECRET);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("backupPath");
    expect(res.body).toHaveProperty("sha256Checksum");
    expect(res.body).toHaveProperty("metadata");
    expect(res.body.metadata).toHaveProperty("integrityCheckStatus", "ok");
  });

  it("GET /api/diagnostics includes backup telemetry", async () => {
    const res = await request(app).get("/api/diagnostics");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("backups");
    expect(res.body.backups).toHaveProperty("total");
    expect(typeof res.body.backups.total).toBe("number");
  });
});
