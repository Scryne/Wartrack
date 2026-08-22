import { RSS_SOURCES, isHtmlPayload } from "../src/services/rss.service";
import { computeReliability } from "../src/services/reliability.service";

/**
 * Iran Int'l returned 200 with the site's HTML shell, which the XML parser
 * reported as "Attribute without value" — a message that reads like a broken
 * feed rather than a wrong URL. This check must catch that without rejecting
 * any real feed.
 */
describe("isHtmlPayload", () => {
  it("detects HTML served in place of a feed", () => {
    expect(isHtmlPayload("<!DOCTYPE html><html><head></head></html>")).toBe(true);
    expect(isHtmlPayload("<html lang='en'><body>Just a moment...</body></html>")).toBe(true);
    expect(isHtmlPayload("  \n  <!doctype HTML>\n<html>")).toBe(true);
    expect(isHtmlPayload("﻿<!DOCTYPE html>")).toBe(true); // BOM-prefixed
  });

  it("accepts the shapes real feeds actually start with", () => {
    // Exact prefixes observed from the live sources this project consumes.
    const realPrefixes = [
      '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">', // Iran Int'l, ISW
      '<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media=', // Haaretz
      '<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">', // Atom
      '﻿<?xml version="1.0"?><rss>', // BOM-prefixed feed
      '  \n<?xml version="1.0"?>\n<rdf:RDF>' // RDF (DW World)
    ];

    for (const prefix of realPrefixes) {
      expect({ prefix: prefix.slice(0, 40), html: isHtmlPayload(prefix) }).toEqual({
        prefix: prefix.slice(0, 40),
        html: false
      });
    }
  });

  it("does not reject a feed that merely mentions html later on", () => {
    const feed =
      '<?xml version="1.0"?><rss><channel><item><description>' +
      '<![CDATA[<html><body>escaped markup in content</body></html>]]>' +
      "</description></item></channel></rss>";

    expect(isHtmlPayload(feed)).toBe(false);
  });
});

/**
 * Guards the feed-URL repairs. These are configuration assertions, not network
 * calls: the live fetch evidence is captured separately, and a test suite that
 * depends on 15 third-party publishers being up would be permanently flaky.
 */
describe("RSS source configuration", () => {
  it("has no duplicate names or URLs", () => {
    const names = RSS_SOURCES.map((s) => s.name);
    const urls = RSS_SOURCES.map((s) => s.url);

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("uses https everywhere, including fallbacks", () => {
    for (const source of RSS_SOURCES) {
      expect(`${source.name}:${source.url}`).toMatch(/:https:\/\//);
      for (const fallback of source.fallbackUrls ?? []) {
        expect(`${source.name}:${fallback}`).toMatch(/:https:\/\//);
      }
    }
  });

  it("only uses categories the feed UI can filter on", () => {
    // FeedPanel's tabs: haber / bölge / savunma / analiz.
    const allowed = new Set(["haber", "bölge", "savunma", "analiz"]);
    for (const source of RSS_SOURCES) {
      expect({ name: source.name, category: source.category }).toEqual({
        name: source.name,
        category: expect.stringMatching(new RegExp(`^(${[...allowed].join("|")})$`))
      });
    }
  });

  it("no longer points at any endpoint found dead against live traffic", () => {
    const dead = [
      "https://feeds.reuters.com/reuters/worldNews", // domain no longer resolves
      "https://www.reutersagency.com/feed/?best-topics=world&post_type=best", // 404
      "https://rsshub.app/apnews/topics/world-news", // Cloudflare challenge
      "https://feeds.feedburner.com/apf-topnews", // 404, discontinued
      "https://apnews.com/index.rss", // 401, needs credentials
      "https://www.timesofisrael.com/feed/", // Cloudflare JS challenge
      "https://www.timesofisrael.com/topic/israel-middle-east/feed/", // same
      "https://www.haaretz.com/srv/haaretz-main-feed.xml", // 404, empty body
      "https://www.iranintl.com/en/rss", // 200 but serves the HTML app shell
      "https://www.understandingwar.org/rss.xml", // 403 at the edge, path-specific
      "https://understandingwar.org/rss.xml" // same, apex host
    ];

    const configured = RSS_SOURCES.flatMap((s) => [s.url, ...(s.fallbackUrls ?? [])]);
    for (const url of dead) {
      expect(configured).not.toContain(url);
    }
  });

  it("keeps the repaired and replacement sources on their verified endpoints", () => {
    const byName = new Map(RSS_SOURCES.map((s) => [s.name, s.url]));

    // Repaired in place
    expect(byName.get("Haaretz EN")).toBe("https://www.haaretz.com/srv/all-headlines-rss");
    expect(byName.get("Iran Int'l")).toBe("https://www.iranintl.com/en/feed");
    expect(byName.get("ISW")).toBe("https://understandingwar.org/feed/?post_type=post");

    // Replacements for the three with no reachable feed
    expect(byName.get("CBS News World")).toBe("https://www.cbsnews.com/latest/rss/world");
    expect(byName.get("NPR World")).toBe("https://feeds.npr.org/1004/rss.xml");
    expect(byName.get("Ynetnews")).toBe(
      "https://www.ynetnews.com/Integration/StoryRss3082.xml"
    );

    // Retired outright
    for (const gone of ["Reuters World", "AP News", "Times of Israel"]) {
      expect(byName.has(gone)).toBe(false);
    }
  });

  it("has a reliability baseline for every configured source", () => {
    // A source missing from SOURCE_BASELINE silently scores 52, below every
    // configured peer, which would quietly bias the feed's confidence labels.
    const missing = RSS_SOURCES.filter(
      (source) => computeReliability({ source: source.name, title: "t" }).reliabilityScore ===
        computeReliability({ source: "__definitely_unknown__", title: "t" }).reliabilityScore
    ).map((s) => s.name);

    expect(missing).toEqual([]);
  });
});
