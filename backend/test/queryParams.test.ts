import { QueryParamError, optionalInt, optionalString } from "../src/lib/queryParams";
import { escapeLikePattern } from "../src/services/rss.service";

/**
 * Express parses query strings with `qs`, so a client controls the *type* of a
 * parameter, not just its value: `?limit=1&limit=2` arrives as an array and
 * `?limit[a]=1` as an object. Both used to reach a better-sqlite3 bind and
 * throw, which the routes reported as a 500.
 */
describe("optionalString", () => {
  it("returns a plain string unchanged", () => {
    expect(optionalString("haber", "category")).toBe("haber");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""]
  ])("treats %s as absent", (_label, value) => {
    expect(optionalString(value, "category")).toBeUndefined();
  });

  it.each([
    ["a repeated parameter", ["a", "b"]],
    ["a nested object", { a: "1" }],
    ["a number", 5]
  ])("rejects %s", (_label, value) => {
    expect(() => optionalString(value, "category")).toThrow(QueryParamError);
  });

  it("names the offending parameter in the message", () => {
    expect(() => optionalString(["a"], "source")).toThrow(/source/);
  });
});

describe("optionalInt", () => {
  const bounds = { fallback: 50, min: 1, max: 200 };

  it("uses the fallback when absent", () => {
    expect(optionalInt(undefined, "limit", bounds)).toBe(50);
  });

  it("parses a numeric string", () => {
    expect(optionalInt("25", "limit", bounds)).toBe(25);
  });

  it("truncates a fractional value rather than binding a float to LIMIT", () => {
    expect(optionalInt("25.9", "limit", bounds)).toBe(25);
  });

  it("clamps rather than rejecting an ambitious but well-formed number", () => {
    expect(optionalInt("100000", "limit", bounds)).toBe(200);
    // A negative LIMIT means "no limit" in SQLite, which is why the floor
    // matters more than it looks.
    expect(optionalInt("-5", "limit", bounds)).toBe(1);
  });

  it.each([
    ["a non-numeric string", "abc"],
    ["an empty-ish word", "NaN"],
    ["a repeated parameter", ["1", "2"]]
  ])("rejects %s", (_label, value) => {
    expect(() => optionalInt(value, "limit", bounds)).toThrow(QueryParamError);
  });

  it("rejects Infinity, which Number() accepts but SQLite cannot use", () => {
    expect(() => optionalInt("Infinity", "limit", bounds)).toThrow(QueryParamError);
  });
});

describe("escapeLikePattern", () => {
  it("escapes the characters LIKE treats as wildcards", () => {
    // Searching for "100%" used to match every row: the trailing % is a
    // wildcard, so the query silently answered a different question.
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves ordinary search terms alone", () => {
    expect(escapeLikePattern("İsrail hava saldırısı")).toBe("İsrail hava saldırısı");
  });
});
