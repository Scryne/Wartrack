import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { assertSharedSecretConfigured, KNOWN_PLACEHOLDER_SECRETS, secretsMatch } from "../src/lib/auth";
import { restoreBackup, verifyBackupIntegrity } from "../src/services/backup.service";
import fs from "fs";
import path from "path";
import os from "os";

const app = createApp(["http://localhost:5173"]);
const VALID_KEY = "test-secret-key-0123456789abcdef";

describe("ADVERSARIAL SECURITY AUDIT", () => {
  beforeEach(() => {
    process.env.API_SHARED_SECRET = VALID_KEY;
  });

  describe("Authentication & Fail-Closed Behavior", () => {
    it("fails closed when API_SHARED_SECRET is undefined or empty", () => {
      process.env.API_SHARED_SECRET = "";
      expect(() => assertSharedSecretConfigured()).toThrow(/API_SHARED_SECRET is not set/);

      delete process.env.API_SHARED_SECRET;
      expect(() => assertSharedSecretConfigured()).toThrow(/API_SHARED_SECRET is not set/);
    });

    it("rejects secrets shorter than 16 characters", () => {
      process.env.API_SHARED_SECRET = "short_key_123";
      expect(() => assertSharedSecretConfigured()).toThrow(/must be at least 16 characters/);
    });

    it("rejects whitespace-only secrets", () => {
      process.env.API_SHARED_SECRET = "                ";
      expect(() => assertSharedSecretConfigured()).toThrow(/API_SHARED_SECRET is not set/);
    });

    it("rejects known repository placeholder secrets", () => {
      for (const placeholder of KNOWN_PLACEHOLDER_SECRETS) {
        process.env.API_SHARED_SECRET = placeholder;
        expect(() => assertSharedSecretConfigured()).toThrow(/known placeholder value/);
      }
    });

    it("verifies constant-time secretsMatch comparison correctly", () => {
      expect(secretsMatch(VALID_KEY, VALID_KEY)).toBe(true);
      expect(secretsMatch(VALID_KEY, "wrong-key-value-1234567890abcdef")).toBe(false);
      expect(secretsMatch(VALID_KEY, "short")).toBe(false);
      expect(secretsMatch("", VALID_KEY)).toBe(false);
    });

    it("accepts valid secrets and tolerates leading/trailing whitespace in env or header", async () => {
      process.env.API_SHARED_SECRET = `  ${VALID_KEY}  `;
      const res = await request(app)
        .post("/api/pins")
        .set("X-API-Key", `  ${VALID_KEY}  `)
        .send({
          lat: 32.0,
          lng: 34.8,
          title: "Auth test pin",
          description: "Testing whitespace trimming",
          category: "info"
        });
      expect(res.status).toBe(201);
    });

    it("rejects wrong keys, missing keys, and invalid header formats on all protected mutating routes", async () => {
      const mutatingRoutes = [
        { method: "post", path: "/api/pins", body: { lat: 32, lng: 34, title: "x", description: "y", category: "info" } },
        { method: "put", path: "/api/pins/99999", body: { title: "x", category: "info" } },
        { method: "delete", path: "/api/pins/99999" },
        { method: "post", path: "/api/events", body: { type: "strike", title: "x" } },
        { method: "delete", path: "/api/events/99999" },
        { method: "post", path: "/api/events/auto" },
        { method: "post", path: "/api/feed/refresh" },
        { method: "post", path: "/api/summarize/1" },
        { method: "post", path: "/api/summarize/rebuild" },
        { method: "put", path: "/api/settings/map.tile", body: { value: "cartodbDark" } },
        { method: "put", path: "/api/settings", body: { "map.tile": "cartodbDark" } },
        { method: "post", path: "/api/bookmarks", body: { articleId: 1 } },
        { method: "delete", path: "/api/bookmarks/1" },
        { method: "post", path: "/api/brief" },
        { method: "post", path: "/api/backup/create" },
        { method: "post", path: "/api/backup/restore", body: { backupPath: "dummy.db" } }
      ];

      for (const endpoint of mutatingRoutes) {
        // No Key
        const noKeyRes = await (request(app) as any)[endpoint.method](endpoint.path).send(endpoint.body || {});
        expect(noKeyRes.status, `Failed for ${endpoint.method.toUpperCase()} ${endpoint.path} without key`).toBe(401);

        // Wrong Key
        const wrongKeyRes = await (request(app) as any)[endpoint.method](endpoint.path)
          .set("X-API-Key", "totally-wrong-fake-key-value-1234")
          .send(endpoint.body || {});
        expect(wrongKeyRes.status, `Failed for ${endpoint.method.toUpperCase()} ${endpoint.path} with wrong key`).toBe(401);
      }
    });

    it("keeps all read endpoints open without requiring authentication", async () => {
      const readRoutes = [
        "/api/health",
        "/api/ready",
        "/api/diagnostics",
        "/api/pins",
        "/api/feed",
        "/api/feed/map-pins",
        "/api/feed/sources",
        "/api/feed/health",
        "/api/events",
        "/api/events/threat-analysis",
        "/api/events/clusters",
        "/api/events/timeline",
        "/api/events/sitrep",
        "/api/events/stats",
        "/api/settings",
        "/api/bookmarks",
        "/api/summarize/status",
        "/api/summarize/latest",
        "/api/backup/list"
      ];

      for (const route of readRoutes) {
        const res = await request(app).get(route);
        expect(res.status, `Read failed on ${route}`).toBe(200);
      }
    });
  });

  describe("Filesystem & Backup Path Traversal Audits (SEC-002)", () => {
    it("rejects path traversal, absolute paths, and outside files during backup restoration", () => {
      const traversalPaths = [
        "../../../../../../etc/passwd",
        "..\\..\\..\\..\\Windows\\System32\\config\\SAM",
        "..\\/..\\/database.db",
        "/proc/self/environ",
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "relative/non/existent/backup.db\0.txt",
        "%2e%2e%2foutside.db"
      ];

      for (const badPath of traversalPaths) {
        expect(() => restoreBackup(badPath)).toThrow();
      }
    });

    it("HTTP GATE: POST /api/backup/restore rejects traversal attacks and targetDbPath overrides", async () => {
      // 1. Path traversal attempt via API
      const res1 = await request(app)
        .post("/api/backup/restore")
        .set("X-API-Key", VALID_KEY)
        .send({ backupPath: "../../etc/shadow" });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/PATH TRAVERSAL|does not exist/i);

      // 2. Windows-style backslash traversal
      const res2 = await request(app)
        .post("/api/backup/restore")
        .set("X-API-Key", VALID_KEY)
        .send({ backupPath: "..\\..\\Windows\\System32\\config\\SAM" });
      expect(res2.status).toBe(400);

      // 3. Prohibited arbitrary targetDbPath injection
      const res3 = await request(app)
        .post("/api/backup/restore")
        .set("X-API-Key", VALID_KEY)
        .send({
          backupPath: "wartracker-backup-dummy.db",
          targetDbPath: "C:\\Windows\\System32\\injected.db"
        });
      expect(res3.status).toBe(400);
      expect(res3.body.message).toMatch(/targetDbPath cannot be overridden/i);

      // 4. Missing backupPath payload
      const res4 = await request(app)
        .post("/api/backup/restore")
        .set("X-API-Key", VALID_KEY)
        .send({});
      expect(res4.status).toBe(400);
      expect(res4.body.message).toMatch(/backupPath is required/i);
    });

    it("rejects corrupted and malicious SQLite databases", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-sec-audit-"));
      const junkPath = path.join(tmpDir, "junk.db");
      fs.writeFileSync(junkPath, "SQLite format 3\0\xFF\xFF\xFFCORRUPTED_PAGE_HEADER");

      const integrity = verifyBackupIntegrity(junkPath);
      expect(integrity.ok).toBe(false);

      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("Input Validation, Injection & DoS Defense", () => {
    it("handles SQL injection payloads in query parameters gracefully", async () => {
      const sqliParams = [
        "1' OR '1'='1",
        "'; DROP TABLE articles; --",
        "1 UNION SELECT 1,2,3,4,5,6,7,8,9,10 --",
        "1' AND SLEEP(5) --",
        "admin'--"
      ];

      for (const sqli of sqliParams) {
        const resFeed = await request(app).get(`/api/feed?search=${encodeURIComponent(sqli)}`);
        expect([200, 400]).toContain(resFeed.status);

        const resEvents = await request(app).get(`/api/events?type=${encodeURIComponent(sqli)}`);
        expect([200, 400]).toContain(resEvents.status);

        const resTimeline = await request(app).get(`/api/events/timeline?hours=${encodeURIComponent(sqli)}`);
        expect(resTimeline.status).toBe(400);
      }
    });

    it("rejects non-numeric inputs and clamps out-of-range numerical parameters per queryParams contract", async () => {
      const nonNumeric = ["NaN", "Infinity", "-Infinity", "abc", "null"];
      for (const bad of nonNumeric) {
        const res = await request(app).get(`/api/events/clusters?hours=${bad}`);
        expect(res.status).toBe(400);
      }

      const resCapped = await request(app).get("/api/events/clusters?hours=999999999");
      expect(resCapped.status).toBe(200);
      expect(resCapped.body.hours).toBe(168);

      const resFloored = await request(app).get("/api/events/clusters?hours=-5");
      expect(resFloored.status).toBe(200);
      expect(resFloored.body.hours).toBe(1);
    });

    it("prevents Prototype Pollution in JSON bodies", async () => {
      const pollutedPayload = JSON.parse('{"__proto__": {"polluted": true}, "title": "Test", "category": "info", "lat": 32.0, "lng": 34.0, "description": "desc"}');
      const res = await request(app)
        .post("/api/pins")
        .set("X-API-Key", VALID_KEY)
        .send(pollutedPayload);

      expect(res.status).toBe(201);
      expect(({} as any).polluted).toBeUndefined();
    });
  });

  describe("Security Headers & HTTP Contract", () => {
    it("sets helmet security headers and removes X-Powered-By", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("returns JSON formatted errors for non-existent routes without leaking stack traces", async () => {
      const res = await request(app).get("/api/non-existent-route-12345");
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body).toHaveProperty("message");
      expect(res.text).not.toContain("node_modules");
      expect(res.text).not.toContain("<!DOCTYPE html>");
    });
  });
});
