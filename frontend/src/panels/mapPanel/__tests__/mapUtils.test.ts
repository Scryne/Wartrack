import { describe, expect, it } from "vitest";
import { escapeHtml, toSafeUrl } from "../mapUtils";

/**
 * D5: toSafeUrl validated the scheme but returned the URL unescaped, and the
 * result is interpolated into a single-quoted href in a popup HTML string.
 * `link` comes from third-party RSS feeds.
 */
describe("toSafeUrl", () => {
  it("rejects non-http(s) schemes", () => {
    expect(toSafeUrl("javascript:alert(1)")).toBe("#");
    expect(toSafeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(toSafeUrl("  ")).toBe("#");
  });

  it("escapes the single quote that would break out of the href attribute", () => {
    const malicious = "https://evil.test/a'onmouseover='alert(1)";
    const result = toSafeUrl(malicious);

    expect(result).not.toContain("'");
    expect(result).toContain("&#39;");
  });

  it("escapes double quotes and angle brackets", () => {
    const result = toSafeUrl('https://evil.test/a"><script>alert(1)</script>');

    expect(result).not.toContain('"');
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("leaves an ordinary URL usable", () => {
    const url = "https://www.reuters.com/world/middle-east/article-123";
    expect(toSafeUrl(url)).toBe(url);
  });

  it("escapes ampersands in query strings without double-escaping", () => {
    expect(toSafeUrl("https://e.test/a?x=1&y=2")).toBe("https://e.test/a?x=1&amp;y=2");
  });
});

describe("escapeHtml", () => {
  it("escapes all five significant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
