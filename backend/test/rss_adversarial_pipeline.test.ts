import { describe, expect, it } from "vitest";
import { isHtmlPayload } from "../src/services/rss.service";
import { extractGeoFromText } from "../src/lib/geoExtract";
import { computeReliability } from "../src/services/reliability.service";
import Parser from "rss-parser";

describe("ADVERSARIAL INGESTION PIPELINE & DATA BOUNDARY AUDIT", () => {
  const parser = new Parser({ timeout: 5000 });

  it("handles malformed, truncated, and corrupt XML without unhandled crashes", async () => {
    const corruptXmls = [
      "<?xml version='1.0'?><rss><channel><title>Broken",
      "<?xml version='1.0'?><rss><channel><item><title><![CDATA[Unclosed CDATA",
      "RANDOM_NON_XML_BINARY_GARBAGE_\x00\x01\x02\xFF\xFE",
      "",
      "   \n\t  ",
      "<?xml version='1.0'?><rss version='2.0'><channel><item><title>Test</title><pubDate>INVALID_DATE_STRING_HERE</pubDate></item></channel></rss>"
    ];

    for (const xml of corruptXmls) {
      if (isHtmlPayload(xml)) continue;

      const handled = await parser
        .parseString(xml)
        .then(() => true)
        .catch((err: unknown) => err instanceof Error);
      expect(handled).toBe(true);
    }
  });

  it("handles huge RSS XML feeds without memory exhaustion or catastrophic backtracking", async () => {
    let hugeXml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Huge Test Feed</title>`;
    for (let i = 0; i < 2000; i++) {
      hugeXml += `
        <item>
          <title>Tactical telemetry dispatch item #${i} in Damascus zone</title>
          <link>https://example.com/item/${i}</link>
          <description>Extensive report with repetitive patterns ${"payload ".repeat(20)}</description>
          <pubDate>${new Date().toUTCString()}</pubDate>
          <guid>guid-huge-${i}</guid>
        </item>
      `;
    }
    hugeXml += `</channel></rss>`;

    expect(hugeXml.length).toBeGreaterThan(1_000_000);

    const parsed = await parser.parseString(hugeXml);
    expect(parsed.items.length).toBe(2000);
  });

  it("sanitizes HTML shells, bot challenge pages, and Cloudflare error pages", () => {
    const challengePages = [
      "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Enable JavaScript</body></html>",
      "<html lang='en'><head><title>Attention Required! | Cloudflare</title></head><body>403 Forbidden</body></html>",
      "  <!doctype html> <html><body><h1>502 Bad Gateway</h1></body></html>",
      "﻿<!DOCTYPE HTML><html><body>Error</body></html>"
    ];

    for (const page of challengePages) {
      expect(isHtmlPayload(page)).toBe(true);
    }
  });

  it("geolocates tactical entities accurately and handles ambiguous or adversarial place names", () => {
    const damascus = extractGeoFromText("Air defense engaged drone near Damascus international airport");
    expect(damascus).not.toBeNull();
    expect(damascus).toEqual([33.5138, 36.2765]);

    const telAviv = extractGeoFromText("Sirens activated in Tel Aviv following projectile alert");
    expect(telAviv).not.toBeNull();
    expect(telAviv).toEqual([32.0853, 34.7818]);

    const nonGeo = extractGeoFromText("Military command issued general combat briefing on troop readiness");
    expect(nonGeo).toBeNull();
  });

  it("computes bounded reliability scores even with malformed, empty, or adversarial text", () => {
    const edgeCases = [
      { source: "Reuters", title: "" },
      { source: "", title: "Valid Title" },
      { source: "Unknown Rogue Source", title: "Unconfirmed rumor claimed by sources", description: "unconfirmed iddia" },
      { source: "BBC World", title: "Official statement confirmed by satellite imagery", description: "ministry dogrulandi" }
    ];

    for (const ec of edgeCases) {
      const rel = computeReliability(ec);
      expect(rel.reliabilityScore).toBeGreaterThanOrEqual(0);
      expect(rel.reliabilityScore).toBeLessThanOrEqual(100);
      expect(["Düşük", "Orta", "Yüksek"]).toContain(rel.confidenceLabel);
      expect(Array.isArray(rel.reliabilitySignals)).toBe(true);
    }
  });

  it("SSRF & URL VALIDATION AUDIT: strictly rejects private IPs, loopback, cloud metadata, and illegal schemes", async () => {
    const dangerousUrls = [
      "http://127.0.0.1/admin",
      "http://127.0.0.2:8080/metrics",
      "http://localhost:3000/api",
      "http://localhost.localdomain",
      "http://[::1]/secret",
      "http://[::ffff:127.0.0.1]/status",
      "http://169.254.169.254/latest/meta-data/",
      "http://169.254.1.1/internal",
      "http://10.0.0.1/router",
      "http://10.254.254.254/intranet",
      "http://172.16.0.1/keys",
      "http://172.31.255.255/db",
      "http://192.168.1.1/admin",
      "http://192.168.0.254/config",
      "http://0.0.0.0/test",
      "http://instance-data/latest",
      "http://metadata.google.internal/computeMetadata/v1",
      "file:///etc/passwd",
      "file:///c:/windows/system32/cmd.exe",
      "gopher://127.0.0.1:25",
      "ftp://anonymous@10.0.0.1/dump",
      "javascript:alert(1)",
      "data:text/html,malicious",
      "http://user:password@example.com/feed",
      "http://",
      "not-a-valid-url"
    ];

    const { validateSafeUrl } = await import("../src/lib/ssrfGuard");

    for (const url of dangerousUrls) {
      const check = await validateSafeUrl(url);
      expect(check.valid, `Dangerous URL was not rejected: ${url}`).toBe(false);
      expect(check.reason).toBeDefined();
    }

    const safeUrls = [
      "https://www.reuters.com/news/world",
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://www.aljazeera.com/xml/rss/all.xml",
      "http://93.184.216.34/feed" // Example public IP (example.com)
    ];

    for (const url of safeUrls) {
      const check = await validateSafeUrl(url);
      expect(check.valid, `Safe URL was falsely rejected: ${url}`).toBe(true);
    }
  });
});
