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
    Doğrudan olayla başla. Örnek: "İsrail hava kuvvetleri..."`;

const STRICT_RETRY_PROMPT = `${SYSTEM_PROMPT}
EK KURAL: Çıktı sadece Türkçe (Latin script) olmalı. Devanagari, Hangul, Kiril, Arapça, Çince ve diğer script karakterleri kesinlikle yasak.`;

/* ───────────────── ENV ───────────────── */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
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
  model: "ollama" | "gemini" | "rule" | "none";
}

const MAX_QUEUE = 30;
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

  while (queue.length > 0) {
    const item = queue.shift()!;

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
  }

  processing = false;
}

export function enqueueSummarize(articleId: number, text: string): Promise<SummarizeResult> {
  return new Promise((resolve) => {
    // If queue full, drop oldest
    if (queue.length >= MAX_QUEUE) {
      const dropped = queue.shift()!;
      dropped.resolve({ summary: "Özet alınamadı", model: "none" });
    }

    queue.push({ articleId, text, resolve });
    processQueue();
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
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
  });
}

export async function geminiSummarize(text: string): Promise<string> {
  return geminiSummarizeWithMode(text, false);
}

async function geminiSummarizeWithMode(text: string, strict: boolean): Promise<string> {
  const model = getGeminiModel();
  if (!model) throw new Error("Gemini API key not configured");
  const userText = `Haber:\n${text}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: strict ? 0.1 : 0.2,
      topP: strict ? 0.85 : 0.9,
      maxOutputTokens: 200
    },
    systemInstruction: strict ? STRICT_RETRY_PROMPT : SYSTEM_PROMPT
  } as any);
  const response = result.response;
  return response.text().trim();
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

function buildRuleBasedSummary(text: string): string {
  const clean = text
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .trim();
  const lower = clean.toLocaleLowerCase("tr-TR");

  const flags = {
    strike: /(strike|attack|airstrike|missile|drone|bomb|raid|çatış|saldırı|taarruz|füze)/i.test(lower),
    diplomacy: /(talks|meeting|minister|diplom|agreement|ateşkes|görüşme|anlaşma)/i.test(lower),
    logistics: /(port|strait|hormuz|ship|navy|marine|fuel|energy|sevkiyat|lojistik)/i.test(lower),
    civilian: /(civilian|hospital|medic|casualt|yaralı|sivil|tıbbi|acil)/i.test(lower)
  };

  if (flags.strike && flags.civilian) {
    return "Kaynak habere göre bölgede askeri saldırı kaynaklı güvenlik baskısı sürüyor ve sivil etki riski öne çıkıyor.";
  }
  if (flags.strike) {
    return "Kaynak habere göre bölgede askeri hareketlilik ve saldırı odaklı güvenlik riski artış eğiliminde.";
  }
  if (flags.diplomacy) {
    return "Kaynak habere göre diplomatik temaslar sürerken sahadaki gerilim tamamen düşmüş görünmüyor.";
  }
  if (flags.logistics) {
    return "Kaynak habere göre enerji ve lojistik hatları üzerindeki baskı bölgesel risk seviyesini etkiliyor.";
  }

  return "Kaynak habere göre bölgesel güvenlik ortamı dalgalı seyrediyor ve durum yakından izlenmeye devam ediyor.";
}

function validateSummary(summary: string, provider: "ollama" | "gemini", strictAttempt: boolean): boolean {
  if (!AI_LANG_GUARD) return true;
  const result = validateTurkishOutput(summary);
  if (result.valid) return true;

  aiMetrics.ai_lang_validation_fail_total += 1;
  if (shouldLogValidationFailure(provider, result.reasons)) {
    console.warn("[AI] Dil doğrulama başarısız", {
      provider,
      model: provider === "ollama" ? OLLAMA_MODEL : "gemini-2.0-flash",
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

  // Providers failed -> deterministic Turkish fallback
  aiMetrics.ai_lang_fallback_total += 1;
  return { summary: buildRuleBasedSummary(text), model: "rule" };
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

db.prepare(`
  UPDATE articles
  SET aiSummary = NULL
  WHERE aiSummary LIKE '%â€%'
     OR aiSummary LIKE '%&#%'
     OR aiSummary LIKE '%\\u00%'
     OR LENGTH(aiSummary) < 20
     OR aiSummary LIKE '%özetlemek%'
     OR aiSummary LIKE '%istiyorsanız%'
     OR aiSummary LIKE '%yazabilirsiniz%'
     OR aiSummary LIKE '%Bu metni%'
`).run();
console.info('[AI] Bozuk özetler temizlendi.');

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
    geminiConfigured: !!(GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_KEY_HERE"),
    geminiBlockedUntil,
    safeMode: AI_SAFE_MODE,
    aiMetrics
  };
}
