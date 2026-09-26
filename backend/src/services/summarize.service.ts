import { GoogleGenerativeAI } from "@google/generative-ai";
import db from "../db";
import { getStringSetting } from "./settings.service";
import { sanitizeAiOutput, validateTurkishOutput } from "../lib/languageGuard";

/* ───────────────── SYSTEM PROMPT ───────────────── */

const SYSTEM_PROMPT = `Sen İran-İsrail çatışmasını takip eden askeri bir analist asistanısın.
Sana verilen haber metnini 1-2 cümle ile Türkçe özetle.

KURALLAR — İSTİSNASIZ UYGULANACAK:
1. Sadece özet yaz. Başka HİÇBİR şey ekleme.
2. "Özetlemek istiyorsanız", "Bu metni", "Yazabilirsiniz" gibi
   meta ifadeler YASAK. Doğrudan özete gir.
3. Özet kesinlikle Türkçe olacak. Türkçe dışı karakter/script kullanma.
4. Maksimum 2 cümle. Daha fazlası yasak.
5. Haber İran-İsrail çatışmasıyla alakasızsa:
   sadece "Bölgesel çatışmayla doğrudan ilgisi yok." yaz.
6. Özeti asla "Bu haber..." veya "Makale..." diye başlatma.
    Doğrudan olayla başla. Örnek: "İsrail hava kuvvetleri..."
7. Yalnızca haberde yazanı aktar. Yorum, çıkarım veya değerlendirme
   ("bu durum ... gösteriyor", "... yansıtıyor", "... anlamına geliyor") yasak.`;

const STRICT_RETRY_PROMPT = `${SYSTEM_PROMPT}
EK KURAL: Çıktı sadece Türkçe (Latin script) olmalı. Devanagari, Hangul, Kiril, Arapça, Çince ve diğer script karakterleri kesinlikle yasak.`;

/* ───────────────── ENV ───────────────── */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const AI_LANG_GUARD = (process.env.AI_LANG_GUARD ?? "1") !== "0";
const AI_SAFE_MODE = (process.env.AI_SAFE_MODE ?? "1") !== "0";

const aiMetrics = {
  ai_lang_validation_fail_total: 0,
  ai_lang_retry_total: 0,
  ai_lang_fallback_total: 0
};

const VALIDATION_LOG_COOLDOWN_MS = 60_000;
const validationLogWindow = new Map<string, number>();

/* ───────────────── RATE LIMITER ───────────────── */

const RATE_LIMIT = 10;           // max per minute
const RATE_WINDOW = 60_000;      // 1 minute
let rateTokens = RATE_LIMIT;
let lastRefill = Date.now();

function consumeToken(): boolean {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= RATE_WINDOW) {
    rateTokens = RATE_LIMIT;
    lastRefill = now;
  }
  if (rateTokens > 0) {
    rateTokens--;
    return true;
  }
  return false;
}

/* ───────────────── QUEUE ───────────────── */

interface QueueItem {
  articleId: number;
  text: string;
  resolve: (value: SummarizeResult) => void;
}

export interface SummarizeResult {
  summary: string;
  model: "ollama" | "gemini" | "none";
}

const MAX_QUEUE = 30;
/** Hard ceiling on how long a caller can be blocked waiting for a summary. */
const SUMMARIZE_TIMEOUT_MS = 120_000;
const queue: QueueItem[] = [];
let processing = false;

function cleanSummary(text: string): string {
  return sanitizeAiOutput(
    text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u00C0-\u00FF][\u0080-\u00BF]/g, '')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/\*\*/g, '')
    .replace(/^#+\s/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  );
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  // try/finally: without it, a throw anywhere below leaves processing === true
  // forever. Every later enqueue would then return at the guard above, the
  // queue would never drain, and every pending promise would hang unresolved.
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;

      // Per-item try/catch: one failed article must not abort the batch or
      // strand its caller.
      try {
        // Wait for rate token
        while (!consumeToken()) {
          await new Promise((r) => setTimeout(r, 3_000));
        }

        const rawResult = await doSummarize(item.text);
        const result: SummarizeResult = {
          ...rawResult,
          summary: cleanSummary(rawResult.summary)
        };

        // Save to DB
        if (result.model !== "none") {
          updateAiSummaryStmt.run(result.summary, item.articleId);
        }

        item.resolve(result);
      } catch (err) {
        console.error(`[AI] Kuyruk hatası (makale #${item.articleId}):`, err);
        item.resolve({ summary: "Özet alınamadı", model: "none" });
      }
    }
  } finally {
    processing = false;
  }
}

export function enqueueSummarize(articleId: number, text: string): Promise<SummarizeResult> {
  return new Promise((resolve) => {
    // Already queued for this article: reuse the in-flight request rather than
    // stacking duplicates. Overlapping cron runs select the same unsummarized
    // rows, since aiSummary is only written once summarisation completes.
    const pending = queue.find((item) => item.articleId === articleId);
    if (pending) {
      const previousResolve = pending.resolve;
      pending.resolve = (value) => {
        previousResolve(value);
        resolve(value);
      };
      return;
    }

    // If queue full, drop oldest
    if (queue.length >= MAX_QUEUE) {
      const dropped = queue.shift()!;
      dropped.resolve({ summary: "Özet alınamadı", model: "none" });
    }

    let settled = false;
    const settle = (value: SummarizeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    // Bound the wait so an HTTP caller is never held open indefinitely.
    const timer = setTimeout(() => {
      const index = queue.findIndex((item) => item.resolve === settle);
      if (index >= 0) queue.splice(index, 1);
      settle({ summary: "Özet alınamadı", model: "none" });
    }, SUMMARIZE_TIMEOUT_MS);
    timer.unref?.();

    queue.push({ articleId, text, resolve: settle });
    void processQueue();
  });
}

/* ───────────────── OLLAMA ───────────────── */

export async function ollamaSummarize(text: string, strict = false): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const userText = `Haber:\n${text}`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: userText,
        system: strict ? STRICT_RETRY_PROMPT : SYSTEM_PROMPT,
        stream: false,
        options: {
          temperature: strict ? 0.1 : 0.2,
          top_p: strict ? 0.85 : 0.9
        }
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

    const json = await res.json();
    return (json.response ?? "").trim();
  } finally {
    clearTimeout(timeout);
  }
}

/* ───────────────── GEMINI ───────────────── */

function getGeminiModel() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_KEY_HERE") {
    return null;
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  });
}

export async function geminiSummarize(text: string): Promise<string> {
  return geminiSummarizeWithMode(text, false);
}

/**
 * Matches ollamaSummarize's 30s abort. Without a deadline a hung Gemini call
 * blocks processQueue()'s `await`, and since that loop is serial, one stuck
 * request stalls every other queued article behind it.
 */
const GEMINI_TIMEOUT_MS = 30_000;

async function geminiSummarizeWithMode(text: string, strict: boolean): Promise<string> {
  const model = getGeminiModel();
  if (!model) throw new Error("Gemini API key not configured");
  const userText = `Haber:\n${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const result = await model.generateContent(
      {
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: strict ? 0.1 : 0.2,
          topP: strict ? 0.85 : 0.9,
          maxOutputTokens: 200
        },
        systemInstruction: strict ? STRICT_RETRY_PROMPT : SYSTEM_PROMPT
      },
      { signal: controller.signal, timeout: GEMINI_TIMEOUT_MS }
    );
    return result.response.text().trim();
  } finally {
    clearTimeout(timeout);
  }
}

let geminiBlockedUntil = 0;
let lastGeminiBlockedLogAt = 0;

function shouldSkipGemini(): boolean {
  return Date.now() < geminiBlockedUntil;
}

function markGeminiBlocked(reason: string, retryMs = 30 * 60_000): void {
  geminiBlockedUntil = Date.now() + retryMs;
  if (Date.now() - lastGeminiBlockedLogAt > VALIDATION_LOG_COOLDOWN_MS) {
    const retrySec = Math.max(1, Math.floor(retryMs / 1000));
    console.warn(`[AI] Gemini geçici olarak devre dışı bırakıldı (${reason}, tekrar deneme ~${retrySec}s)`);
    lastGeminiBlockedLogAt = Date.now();
  }
}

function getRetryMsFromMessage(message: string): number | null {
  const retryMatch = message.match(/retry in\s+([\d.]+)s/i) ?? message.match(/"retryDelay":"(\d+)s"/i);
  if (!retryMatch) return null;
  const value = Number(retryMatch[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(30 * 60_000, Math.round(value * 1000));
}

function shouldLogValidationFailure(provider: "ollama" | "gemini", reasons: string[]): boolean {
  const key = `${provider}:${reasons.sort().join("|")}`;
  const last = validationLogWindow.get(key) ?? 0;
  if (Date.now() - last < VALIDATION_LOG_COOLDOWN_MS) return false;
  validationLogWindow.set(key, Date.now());
  return true;
}

function validateSummary(summary: string, provider: "ollama" | "gemini", strictAttempt: boolean): boolean {
  if (!AI_LANG_GUARD) return true;
  const result = validateTurkishOutput(summary);
  if (result.valid) return true;

  aiMetrics.ai_lang_validation_fail_total += 1;
  if (shouldLogValidationFailure(provider, result.reasons)) {
    console.warn("[AI] Dil doğrulama başarısız", {
      provider,
      model: provider === "ollama" ? OLLAMA_MODEL : GEMINI_MODEL,
      promptVersion: strictAttempt ? "strict-v2" : "default-v2",
      detectedLanguage: result.detectedLanguage,
      scriptFlags: result.hasDisallowedScript,
      reasons: result.reasons
    });
  }

  return false;
}

async function summarizeWithProvider(provider: "ollama" | "gemini", text: string): Promise<string | null> {
  const initial = provider === "ollama" ? await ollamaSummarize(text, false) : await geminiSummarizeWithMode(text, false);
  if (initial && validateSummary(initial, provider, false)) return initial;

  aiMetrics.ai_lang_retry_total += 1;
  const retry = provider === "ollama" ? await ollamaSummarize(text, true) : await geminiSummarizeWithMode(text, true);
  if (retry && validateSummary(retry, provider, true)) return retry;
  return null;
}

/* ───────────────── COMBINED SUMMARIZER ───────────────── */

async function doSummarize(text: string): Promise<SummarizeResult> {
  const preferred = getStringSetting("ai.model", "ollama").toLowerCase() === "gemini" ? "gemini" : "ollama";
  const order: Array<"ollama" | "gemini"> = preferred === "gemini" ? ["gemini", "ollama"] : ["ollama", "gemini"];
  const geminiUsable = !!(GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_KEY_HERE") && !shouldSkipGemini();

  for (const provider of order) {
    if (provider === "gemini" && !geminiUsable) {
      continue;
    }
    try {
      const summary = await summarizeWithProvider(provider, text);
      if (summary) {
        console.warn(`[AI] ${provider === "ollama" ? "Ollama" : "Gemini"} özet oluşturdu`);
        return { summary, model: provider };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (provider === "gemini" && /429|quota exceeded|rate limit/i.test(message)) {
        markGeminiBlocked("kota/rate-limit", getRetryMsFromMessage(message) ?? undefined);
      }
      console.warn(`[AI] ${provider === "ollama" ? "Ollama" : "Gemini"} hata: ${err instanceof Error ? err.message : err}`);
    }
  }

  // No provider produced a valid summary. Nothing is written, so the article
  // stays unsummarized and the next cycle retries it. The former fallback
  // stored one of five canned sentences ("bölgesel güvenlik ortamı dalgalı
  // seyrediyor…") chosen by keyword, which the feed then displayed as the AI
  // summary of unrelated stories, a science piece included.
  aiMetrics.ai_lang_fallback_total += 1;
  return { summary: "", model: "none" };
}

/* ───────────────── PUBLIC API ───────────────── */

export async function summarizeArticle(articleId: number, text: string): Promise<SummarizeResult> {
  const result = await enqueueSummarize(articleId, text);
  return {
    ...result,
    summary: cleanSummary(result.summary)
  };
}

/* ───────────────── DB HELPERS ───────────────── */

const updateAiSummaryStmt = db.prepare(`
  UPDATE articles SET aiSummary = ? WHERE id = ?
`);

// The one-shot cleanup of corrupt aiSummary values now lives in migration 4.
// It used to run here at module scope, i.e. on every import, which also
// re-nulled every legitimately short summary on each restart.

const getUnsummarizedStmt = db.prepare(`
  SELECT id, title, description
  FROM articles
  WHERE aiSummary IS NULL
  ORDER BY pubDate DESC
  LIMIT ?
`);

const getLatestSummariesStmt = db.prepare(`
  SELECT id, title, aiSummary, source
  FROM articles
  WHERE aiSummary IS NOT NULL AND aiSummary != 'Özet alınamadı'
  ORDER BY pubDate DESC
  LIMIT ?
`);

const getExistingSummariesStmt = db.prepare(`
  SELECT id, aiSummary
  FROM articles
  WHERE aiSummary IS NOT NULL AND aiSummary != ''
  ORDER BY pubDate DESC
  LIMIT ?
`);

const clearAiSummaryStmt = db.prepare(`
  UPDATE articles
  SET aiSummary = NULL
  WHERE id = ?
`);

const clearRecentSummariesStmt = db.prepare(`
  UPDATE articles
  SET aiSummary = NULL
  WHERE id IN (
    SELECT id FROM articles
    ORDER BY pubDate DESC
    LIMIT ?
  )
`);

export interface UnsummarizedArticle {
  id: number;
  title: string;
  description: string | null;
}

export interface SummaryEntry {
  id: number;
  title: string;
  aiSummary: string;
  source: string;
}

export function getUnsummarized(limit: number): UnsummarizedArticle[] {
  return getUnsummarizedStmt.all(limit) as UnsummarizedArticle[];
}

export function getLatestSummaries(limit: number): SummaryEntry[] {
  const rows = getLatestSummariesStmt.all(limit) as SummaryEntry[];
  return rows.filter((row) => validateTurkishOutput(row.aiSummary).valid);
}

export function clearInvalidSummaries(limit = 600): number {
  const rows = getExistingSummariesStmt.all(limit) as Array<{ id: number; aiSummary: string }>;
  let cleared = 0;
  for (const row of rows) {
    const cleaned = cleanSummary(row.aiSummary);
    const valid = validateTurkishOutput(cleaned).valid;
    if (!valid || cleaned.length < 20) {
      clearAiSummaryStmt.run(row.id);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.warn(`[AI] ${cleared} bozuk özet temizlenip tekrar kuyruğa alındı`);
  }
  return cleared;
}

export function clearRecentSummaries(limit = 300): number {
  const result = clearRecentSummariesStmt.run(limit);
  return Number(result.changes ?? 0);
}

export function getQueueStatus() {
  return {
    queueLength: queue.length,
    processing,
    rateTokensRemaining: rateTokens,
    ollamaUrl: OLLAMA_URL,
    ollamaModel: OLLAMA_MODEL,
    geminiModel: GEMINI_MODEL,
    geminiConfigured: !!(GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_KEY_HERE"),
    geminiBlockedUntil,
    safeMode: AI_SAFE_MODE,
    aiMetrics
  };
}
