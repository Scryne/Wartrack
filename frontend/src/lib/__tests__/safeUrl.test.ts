import { describe, expect, it } from "vitest";
import { toSafeHref } from "../safeUrl";
import { toSafeUrl } from "../../panels/mapPanel/mapUtils";

/**
 * article.link is third-party RSS content. React does not sanitise `href` — it
 * logs a warning for a javascript: URL and renders it anyway — so FeedCard
 * rendering `href={article.link}` executed feed-controlled script on click.
 */
describe("toSafeHref", () => {
  it("passes through ordinary http and https links", () => {
    expect(toSafeHref("https://example.test/a?b=1#c")).toBe("https://example.test/a?b=1#c");
    expect(toSafeHref("http://example.test/")).toBe("http://example.test/");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(toSafeHref("  https://example.test/a  ")).toBe("https://example.test/a");
  });

  const HOSTILE: Array<[string, string]> = [
    ["plain javascript:", "javascript:alert(1)"],
    ["mixed case", "JaVaScRiPt:alert(1)"],
    // The URL parser strips tabs, newlines and leading control characters
    // before resolving the scheme, so a regex blocklist anchored at the start
    // of the string would pass all three of these straight through.
    ["embedded tabs", "java\tscript:alert(1)"],
    ["embedded newline", "java\nscript:alert(1)"],
    ["leading control char", "javascript:alert(1)"],
    ["data URL", "data:text/html,<script>alert(1)</script>"],
    ["vbscript", "vbscript:msgbox(1)"],
    ["file", "file:///etc/passwd"]
  ];

  it.each(HOSTILE)("rejects %s", (_label, hostile) => {
    expect(toSafeHref(hostile)).toBeUndefined();
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["a relative path", "/relative/path"],
    ["not a URL at all", "not a url"],
    ["null", null],
    ["undefined", undefined]
  ])("returns undefined for %s", (_label, value) => {
    expect(toSafeHref(value as string | null | undefined)).toBeUndefined();
  });

  it("returns the parsed form, so what was validated is what gets rendered", () => {
    // The parser strips the tab that would otherwise survive into the DOM.
    expect(toSafeHref("ht\ttps://example.test/a")).toBe("https://example.test/a");
    expect(toSafeHref("https://example.test/a")).toBe("https://example.test/a");
    // And percent-encodes the angle brackets and double quote.
    expect(toSafeHref('https://example.test/a<b>"c')).toBe(
      "https://example.test/a%3Cb%3E%22c"
    );
  });
});

describe("toSafeUrl (Leaflet popup interpolation)", () => {
  it("shares toSafeHref's scheme rules", () => {
    expect(toSafeUrl("javascript:alert(1)")).toBe("#");
    expect(toSafeUrl("data:text/html,x")).toBe("#");
    expect(toSafeUrl("https://example.test/a")).toBe("https://example.test/a");
  });

  it("leaves no raw quote that could close the href attribute", () => {
    // This value is interpolated into a single-quoted href in a template
    // string, so a bare scheme check would let it open an event handler.
    const escaped = toSafeUrl("https://example.test/a'onmouseover='alert(1)");

    expect(escaped).not.toContain("'");
    expect(escaped).not.toContain("onmouseover='");
  });
});
