// Mirrors backend lib/languageGuard.ts. no-misleading-character-class fires
// because the Devanagari and Arabic ranges contain combining marks; matching
// one in isolation is the intent here, since this is a presence test for
// "any codepoint from a script Turkish output must never contain".
// eslint-disable-next-line no-misleading-character-class
const DISALLOWED_SCRIPTS = /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/u;

export function hasDisallowedScript(text: string): boolean {
  return DISALLOWED_SCRIPTS.test(text);
}

export function sanitizeTextOutput(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s.,;:!?()\[\]{}"'`“”‘’\-_/+%&@#*=<>|~^$€£¥°…•◈↗]/gu, "")
    .replace(/[^\S\r\n]{2,}/g, " ")
    .trim();
}
