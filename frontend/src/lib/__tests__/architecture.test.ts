import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Guards for frontend invariants that behavioural tests would not protect.
 *
 * The XSS fix is a single call site: FeedCard renders `article.link`, which is
 * whatever a third-party RSS feed put in its <link> element. Reverting it to
 * `href={article.link}` breaks nothing visible, passes every other test, and
 * silently restores a javascript: execution path. That is exactly the kind of
 * regression a source-level guard is for.
 */

const SRC = path.resolve(__dirname, "../..");

function readCode(relative: string): string {
  return fs
    .readFileSync(path.join(SRC, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Not `//` inside a URL — require the comment to start a line or follow
    // whitespace, so "https://x" survives.
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function listFiles(dir: string): string[] {
  const absolute = path.join(SRC, dir);
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

describe("untrusted URLs never reach an href unchecked", () => {
  it("no component interpolates a raw link into href", () => {
    const offenders: string[] = [];

    for (const dir of ["components", "panels", "panels/mapPanel"]) {
      for (const file of listFiles(dir)) {
        const code = readCode(file);

        // `href={article.link}` / `href={pin.link}` / `href={x.url}` with no
        // sanitising call in between.
        const rawHref = /href=\{\s*(?!.*(?:toSafeHref|toSafeUrl))[A-Za-z_$][\w$]*\.(link|url|href)\s*\}/g;
        for (const match of code.matchAll(rawHref)) {
          offenders.push(`${file}: ${match[0]}`);
        }

        // The Leaflet popups build HTML by string concatenation, where a raw
        // link would also break out of the quoted attribute.
        const rawHrefInTemplate = /href='\$\{\s*(?!.*(?:toSafeUrl|safeLink))/g;
        if (rawHrefInTemplate.test(code)) {
          offenders.push(`${file}: template href without toSafeUrl`);
        }
      }
    }

    expect(offenders, "use toSafeHref()/toSafeUrl() from lib/safeUrl").toEqual([]);
  });

  it("FeedCard still routes its link through toSafeHref", () => {
    const code = readCode("components/FeedCard.tsx");

    expect(code).toContain("toSafeHref");
    expect(code).toMatch(/href=\{\s*safeHref\s*\}/);
    expect(code).not.toMatch(/href=\{\s*article\.link\s*\}/);
  });

  it("toSafeUrl delegates to the shared scheme check rather than its own regex", () => {
    // Two independent implementations drift. The map popup path previously had
    // its own `/^https?:\/\//` test while FeedCard had none at all.
    const code = readCode("panels/mapPanel/mapUtils.ts");

    // The *body* must call it. Asserting on the whole file passed even after
    // the body was rewritten to an inline regex, because the now-unused import
    // still mentioned the name — found by mutation-testing this guard.
    const body = code.slice(code.indexOf("export function toSafeUrl"));
    const end = body.indexOf("\n}");
    const toSafeUrlBody = body.slice(0, end);

    expect(toSafeUrlBody).toContain("toSafeHref");
    expect(toSafeUrlBody).not.toMatch(/https\?/);
  });

  it("the scheme allowlist is an allowlist, not a javascript: blocklist", () => {
    const code = readCode("lib/safeUrl.ts");

    expect(code).toContain("ALLOWED_PROTOCOLS");
    expect(code).toContain("new URL(");
    // A blocklist loses to java\tscript:, %0a and case tricks.
    expect(code).not.toMatch(/!==\s*["']javascript:["']/);
  });
});

describe("the API key never leaves its own store", () => {
  it("useSettingsStore does not carry the shared secret", () => {
    // The settings store round-trips through PUT/GET /api/settings. Putting
    // the key there would persist it server-side as a plaintext row.
    const code = readCode("stores/useSettingsStore.ts");

    expect(code).not.toMatch(/apiKey/i);
  });

  it("only lib/api attaches the key header", () => {
    const offenders: string[] = [];

    for (const dir of ["components", "panels", "stores", "hooks"]) {
      for (const file of listFiles(dir)) {
        if (/X-API-Key/i.test(readCode(file))) offenders.push(file);
      }
    }

    expect(offenders, "route writes through apiFetch() instead").toEqual([]);
  });
});
