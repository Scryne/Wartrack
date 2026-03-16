const DISALLOWED_SCRIPT_RANGES = /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/u;
const ALLOWED_OUTPUT_CHARS = /[^\p{L}\p{N}\s.,;:!?()\[\]{}"'`“”‘’\-_/+%&@#*=<>|~^$€£¥°…•◈↗]/gu;
const TURKISH_HINT_WORDS = [
  "ve",
  "ile",
  "icin",
  "ancak",
  "olarak",
  "saldiri",
  "israil",
  "iran",
  "hava",
  "roket",
  "operasyon",
  "bolge",
  "kritik",
  "gelisme",
  "kaynak"
];

const FOREIGN_MARKER_WORDS = [
  "the",
  "and",
  "or",
  "but",
  "into",
  "across",
  "between",
  "after",
  "before",
  "during",
  "with",
  "from",
  "under",
  "over",
  "about",
  "against",
  "around",
  "through",
  "without",
  "is",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "will",
  "would",
  "could",
  "should",
  "can",
  "their",
  "there",
  "they",
  "them",
  "these",
  "this",
  "that",
  "those",
  "news",
  "report",
  "reports",
  "analysis",
  "live",
  "breaking",
  "service",
  "services",
  "goal",
  "goals",
  "possible",
  "possibly",
  "consideration",
  "considering",
  "cleared",
  "mobilized",
  "thousands",
  "life",
  "daily",
  "urgent",
  "para",
  "con",
  "por",
  "que",
  "como",
  "pero",
  "los",
  "las",
  "del",
  "esta",
  "este",
  "una",
  "unos"
];

const FOREIGN_PATTERN = /\b(the|and|with|from|into|under|over|service|support|analysis|report|reports|live|daily|goal|goals|possible|consider\w*|clear\w*|thousand\w*|life|warship\w*|airbase\w*)\b/gi;

export interface LanguageValidationResult {
  valid: boolean;
  detectedLanguage: "tr" | "unknown";
  hasDisallowedScript: boolean;
  reasons: string[];
}

function normalizeForLanguageCheck(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateTurkish(text: string): "tr" | "unknown" {
  const normalized = normalizeForLanguageCheck(text);
  if (!normalized) return "unknown";
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 4) return "unknown";
  const hits = words.filter((word) => TURKISH_HINT_WORDS.includes(word)).length;
  const ratio = hits / words.length;
  return ratio >= 0.08 || hits >= 2 ? "tr" : "unknown";
}

export function sanitizeAiOutput(text: string): string {
  return text.replace(ALLOWED_OUTPUT_CHARS, "").replace(/[^\S\r\n]{2,}/g, " ").trim();
}

export function validateTurkishOutput(text: string): LanguageValidationResult {
  const reasons: string[] = [];
  const hasDisallowedScript = DISALLOWED_SCRIPT_RANGES.test(text);
  const detectedLanguage = estimateTurkish(text);
  const normalized = normalizeForLanguageCheck(text);
  const words = normalized.split(" ").filter((w) => w.length >= 3);
  const foreignHits = words.filter((w) => FOREIGN_MARKER_WORDS.includes(w)).length;
  const foreignPatternHits = (text.match(FOREIGN_PATTERN) ?? []).length;
  const foreignRatio = words.length > 0 ? foreignHits / words.length : 0;

  if (hasDisallowedScript) reasons.push("disallowed_script");
  if (detectedLanguage !== "tr") reasons.push("language_not_turkish");
  if ((foreignHits >= 1 && foreignRatio > 0.05) || foreignPatternHits >= 1 || /\b[a-z]+\'s\b/i.test(text)) {
    reasons.push("foreign_word_ratio_high");
  }

  return {
    valid: reasons.length === 0,
    detectedLanguage,
    hasDisallowedScript,
    reasons
  };
}
