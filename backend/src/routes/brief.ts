import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import db from "../db";
import { sanitizeAiOutput, validateTurkishOutput } from "../lib/languageGuard";
import { sqliteIsoNow } from "../lib/time";
import { rateLimit } from "../lib/rateLimit";
import { requireApiKey } from "../lib/auth";
import { asyncRoute } from "../lib/http";
import { computeExplainableThreat } from "../services/threat.service";

const briefRouter = Router();

// briefRouter is mounted separately from apiRouter (at /api/brief), so it
// needs its own gate. POST /api/brief is the cost-amplification path.
briefRouter.use(requireApiKey);

interface BriefArticleRow {
  id: number;
  title: string;
  description: string | null;
  source: string;
  pubDate: string;
  aiSummary: string | null;
}

// Theatre only (articles the gazetteer placed in the region). World feeds mix
// in domestic politics and tech; fed to the brief they became bullets about
// TikTok settlements under "SON 6 SAATİN ÖZETİ".
const getRecentArticlesStmt = db.prepare(`
  SELECT id, title, description, source, pubDate, aiSummary
  FROM articles
  WHERE pubDate > ${sqliteIsoNow("-6 hours")}
    AND lat IS NOT NULL AND lng IS NOT NULL
  ORDER BY pubDate DESC
  LIMIT 80
`);

const getTopEventStmt = db.prepare(`
  SELECT e.title, e.source, e.severity, e.createdAt, a.aiSummary
  FROM events e
  LEFT JOIN articles a ON a.id = e.articleId
  WHERE e.createdAt > ${sqliteIsoNow("-6 hours")}
    AND CAST(e.severity AS INTEGER) >= 4
  ORDER BY CAST(e.severity AS INTEGER) DESC, e.createdAt DESC
  LIMIT 1
`);

const TREND_WORD = {
  ESCALATING: "artışta",
  STABLE: "yatay",
  "DE-ESCALATING": "düşüşte"
} as const;

const BRIEF_CACHE_TTL_MS = 90_000;
const BRIEF_MODEL_ENABLED = (process.env.BRIEF_MODEL_ENABLED ?? "0") === "1";

let briefCache: {
  key: string;
  brief: string;
  model: string;
  modelName?: string;
  generatedAt: string;
  expiresAt: number;
} | null = null;

const RELEVANCE_PATTERNS: RegExp[] = [
  /iran|israil|israel|gaza|hamas|hezbollah|hizbullah|idf|tehran|hormuz|kizildeniz|red sea|syria|suriye|lebanon|lubnan|iraq|yemen|hus[ie]/i,
  /strike|attack|missile|drone|airstrike|raid|bomb|intercept|rocket|saldiri|taarruz|fuze|ih[aı]/i,
  /ceasefire|ateskes|talks|gorusme|diploma|sanction|yaptirim|mobilization|deployment|sevk|evacuation|tahliye/i
];

const NOISE_PATTERNS: RegExp[] = [
  /f1|formula 1|oscars|grammy|movie|cinema|football|soccer|tennis|celebrity|fashion|music/i
];

const BRIEF_HEADINGS = {
  summary: "## SON 6 SAATİN ÖZETİ",
  critical: "## KRİTİK GELİŞME",
  trend: "## TREND ANALİZİ"
} as const;

// The model writes only the news summary. "Kritik gelişme" and "Trend" are
// measurements (highest-severity event, event counts) and are filled in by
// code: asked to judge them from headlines, the model wrote "no critical
// event" beside a severity-5 event the system had recorded, and padded the
// trend with commentary. Counting is code's job; summarizing text is the model's.
const BRIEF_SYSTEM_PROMPT = `Sen İran-İsrail çatışmasını izleyen bir haber editörüsün.
Yalnızca verilen haberlere dayanarak Türkçe, 3-4 maddelik bir özet yaz.
Her madde tek bir gelişmeyi tek cümleyle, en fazla 25 kelimeyle aktarır.
Yorum, tahmin ve değerlendirme ("bu durum ... gösteriyor") ekleme.

Çıktı formatı zorunlu:
- ...
- ...
- ...

Başlık, giriş, kapanış veya ek not yazma.`;

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let geminiModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

function getGeminiModel() {
  if (!geminiModel && GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_KEY_HERE") {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  }
  return geminiModel;
}

async function ollamaBrief(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: BRIEF_SYSTEM_PROMPT,
        prompt,
        stream: false,
        // Explicit window and answer budget: Ollama's defaults left no room
        // for the answer once the news context was in.
        options: { num_ctx: 8192, num_predict: 700, temperature: 0.2 }
      }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const json = await res.json();
    return String(json?.response ?? "").trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Gemini is the *fallback* provider, reached only after Ollama has already
 * spent up to 45s failing. Without its own deadline a hung call would hold the
 * HTTP request open indefinitely — ollamaBrief() aborts, this one did not.
 */
const GEMINI_TIMEOUT_MS = 45_000;

async function geminiBrief(prompt: string): Promise<string> {
  const model = getGeminiModel();
  if (!model) throw new Error("Gemini API key not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const result = await model.generateContent(
      {
        systemInstruction: BRIEF_SYSTEM_PROMPT,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      },
      { signal: controller.signal, timeout: GEMINI_TIMEOUT_MS }
    );

    return result.response.text().trim();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBrief(text: string): string {
  return sanitizeAiOutput(
    text
    .replace(/\r/g, "")
    .replace(/^\s*```(?:markdown)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
  );
}

function normalizeLine(text: string): string {
  return sanitizeAiOutput(
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function articleScore(article: BriefArticleRow): number {
  const text = `${article.title} ${article.description ?? ""} ${article.aiSummary ?? ""}`;
  const relevance = RELEVANCE_PATTERNS.reduce((acc, re) => (re.test(text) ? acc + 1 : acc), 0);
  const noise = NOISE_PATTERNS.some((re) => re.test(text)) ? 2 : 0;
  const recencyHours = Math.max(0, (Date.now() - new Date(article.pubDate).getTime()) / 3_600_000);
  const recencyBonus = recencyHours <= 2 ? 3 : recencyHours <= 6 ? 2 : 1;
  return relevance * 3 + recencyBonus - noise;
}

/**
 * First sentence only. Small models append their own reading as a second
 * sentence ("Bu durum ... gösteriyor"); the brief reports, it does not
 * interpret, so what follows the first full stop is dropped.
 */
function firstSentence(text: string): string {
  const [first] = text.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ"“])/u);
  return first.trim();
}

/** The article's own AI summary, when it passed the Turkish-output checks. */
function usableSummary(article: BriefArticleRow): string | null {
  const safeAi = article.aiSummary ? normalizeLine(article.aiSummary) : "";
  const hasForeignNoise = /\b(the|and|with|from|into|under|over|retaliatory|direct|service|support|analysis|ongoing|thousands|daily|breaking)\b/i.test(safeAi);
  return safeAi && validateTurkishOutput(safeAi).valid && !hasForeignNoise ? firstSentence(safeAi) : null;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

interface MeasuredContext {
  /** "08:40, Jerusalem Post (şiddet 5/5): ..." or null when no 4+ event. */
  critical: string | null;
  recent: number;
  prior: number;
  direction: (typeof TREND_WORD)[keyof typeof TREND_WORD];
}

/** What the system has measured about the last 12 hours, independent of any model. */
function measureContext(): MeasuredContext {
  const top = getTopEventStmt.get() as
    | { title: string; source: string | null; severity: string; createdAt: string; aiSummary: string | null }
    | undefined;
  // The event's own Turkish summary when there is one; otherwise the source's
  // headline, quoted, so it reads as a citation rather than our wording.
  const topText = top
    ? usableSummary({ id: 0, title: top.title, description: null, source: top.source ?? "", pubDate: top.createdAt, aiSummary: top.aiSummary }) ??
      `"${top.title}"`
    : null;
  const critical = top
    ? `${formatClock(top.createdAt)}, ${top.source ?? "Kaynak belirsiz"} (şiddet ${top.severity}/5): ${topText}`
    : null;

  // Counts and direction come from the threat engine itself, so the brief
  // and the threat panel cannot disagree about the same six hours.
  const analysis = computeExplainableThreat();
  const recent = analysis.metrics.recent6hCount;
  const prior = analysis.metrics.prior6hCount;
  const direction = TREND_WORD[analysis.temporalTrend];
  return { critical, recent, prior, direction };
}

const NO_CRITICAL_TEXT = "Son 6 saatte 4 ve üzeri şiddette olay kaydı yok.";

const BRIEF_CONTEXT_ARTICLES = 24;

/**
 * The brief used when no model is enabled or reachable.
 *
 * It states only what the system has measured. The earlier version turned
 * keyword counts into analyst prose ("trend tırmanma yönünde; sivil etki riski
 * yüksek seyrediyor") and padded short lists with filler bullets: text that
 * read like judgement but was a template, which is the one thing an
 * intelligence brief must not do.
 */
function buildRuleBasedBrief(allArticles: BriefArticleRow[]): string {
  const ranked = allArticles
    .map((a) => ({ article: a, score: articleScore(a) }))
    .sort((a, b) => b.score - a.score || +new Date(b.article.pubDate) - +new Date(a.article.pubDate));

  const bullets: string[] = [];
  for (const { article } of ranked) {
    const summary = usableSummary(article);
    if (!summary || bullets.includes(summary)) continue;
    bullets.push(summary);
    if (bullets.length >= 4) break;
  }
  if (bullets.length === 0) {
    bullets.push(
      `Son 6 saatte bölgeye ait ${allArticles.length} haber var; hiçbiri henüz özetlenmedi. Özet kuyruğu işlendikçe maddeler burada görünecek.`
    );
  }

  const measured = measureContext();
  const critical = measured.critical ?? NO_CRITICAL_TEXT;
  const trend = `Olay sayısı ${measured.direction}: son 6 saatte ${measured.recent}, önceki 6 saatte ${measured.prior} olay. Bu bölüm model kapalıyken yalnız sayımlardan üretilir; yorum içermez.`;

  return `${BRIEF_HEADINGS.summary}
- ${bullets.join("\n- ")}

${BRIEF_HEADINGS.critical}
${critical}

${BRIEF_HEADINGS.trend}
${trend}`;
}

function makeBriefCacheKey(articles: BriefArticleRow[]): string {
  const seed = articles
    .slice(0, 12)
    .map((a) => `${a.id}-${a.pubDate}`)
    .join("|");
  return `${articles.length}:${seed}`;
}

/**
 * Model bullets + measured sections. Throws when the model gave no usable
 * Turkish bullet, so the caller falls through to the next provider or to the
 * rule brief instead of showing a placeholder.
 */
function composeModelBrief(modelText: string, measured: MeasuredContext): string {
  const bullets = normalizeBrief(modelText)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
    // Markdown emphasis ("**Başlık:**") is not rendered by the panel.
    .map((line) => firstSentence(normalizeLine(line.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/\*\*|__/g, ""))))
    .filter((line) => line.length > 0 && validateTurkishOutput(line).valid)
    .slice(0, 4);

  if (bullets.length === 0) {
    throw new Error(`Model returned no usable Turkish bullet: ${JSON.stringify(modelText.slice(0, 240))}`);
  }

  return `${BRIEF_HEADINGS.summary}
- ${bullets.join("\n- ")}

${BRIEF_HEADINGS.critical}
${measured.critical ?? NO_CRITICAL_TEXT}

${BRIEF_HEADINGS.trend}
Olay sayısı ${measured.direction}: son 6 saatte ${measured.recent}, önceki 6 saatte ${measured.prior} olay.`;
}

// Each uncached call runs an LLM request, and { force: true } bypasses the
// 90s cache entirely, so this is the cost-amplification path (billed Gemini).
const briefRateLimit = rateLimit({
  max: 10,
  windowMs: 60_000,
  message: "Durum özeti istekleri sınırlandırıldı. Lütfen biraz sonra tekrar deneyin."
});

briefRouter.post("/", briefRateLimit, asyncRoute(async (req, res) => {
  const articles = getRecentArticlesStmt.all() as BriefArticleRow[];
  const force = Boolean(req.body?.force);
  const cacheKey = makeBriefCacheKey(articles);
  const now = Date.now();

  if (!force && briefCache && briefCache.key === cacheKey && briefCache.expiresAt > now) {
    return res.json({ brief: briefCache.brief, model: briefCache.model, modelName: briefCache.modelName, generatedAt: briefCache.generatedAt, cached: true });
  }

  if (articles.length === 0) {
    const response = {
      brief: `${BRIEF_HEADINGS.summary}
- Son 6 saatte analiz edilecek haber bulunamadı.

${BRIEF_HEADINGS.critical}
Kritik düzeyde olay tespit edilmedi.

${BRIEF_HEADINGS.trend}
Veri akışı olmadığı için trend statik görünüyor.`,
      model: "none",
      generatedAt: new Date().toISOString()
    };
    briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
    return res.json(response);
  }

  // Not passed through ensureBriefSections: that gate exists for model output.
  // The rule brief is composed here from summaries that each passed the
  // Turkish check, plus a quoted source headline, which the whole-text language
  // check would reject and replace with a placeholder.
  const ruleBrief = normalizeBrief(buildRuleBasedBrief(articles));
  const generatedAt = new Date().toISOString();

  if (!BRIEF_MODEL_ENABLED) {
    const response = { brief: ruleBrief, model: "rule", generatedAt };
    briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
    return res.json(response);
  }

  // The most relevant stories only, title plus summary. All 80 with their
  // descriptions overflowed the model's context window, and the answer came
  // back cut off mid-sentence.
  const context = articles
    .map((a) => ({ article: a, score: articleScore(a) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, BRIEF_CONTEXT_ARTICLES)
    .map(({ article: a }, i) => {
      const detail = usableSummary(a) ?? (a.description ? a.description.slice(0, 200) : "");
      return `${i + 1}. [${a.source}] ${a.title}${detail ? ` — ${detail}` : ""}`;
    })
    .join("\n");

  const measured = measureContext();
  const BRIEF_PROMPT = `Son 6 saatte bölgeden gelen haberler aşağıda. En önemli 3-4 gelişmeyi madde madde, Türkçe yaz.

HABERLER:
${context}
`;

  try {
    const result = await ollamaBrief(BRIEF_PROMPT);
      const modelBrief = composeModelBrief(result, measured);
      const response = { brief: modelBrief, model: "ollama", modelName: OLLAMA_MODEL, generatedAt: new Date().toISOString() };
      briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
      return res.json(response);
    } catch (err) {
      console.warn("[AI Brief] Ollama failed:", err instanceof Error ? err.message : err);

    try {
      const result = await geminiBrief(BRIEF_PROMPT);
      const modelBrief = composeModelBrief(result, measured);
      const response = { brief: modelBrief, model: "gemini", modelName: GEMINI_MODEL, generatedAt: new Date().toISOString() };
      briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
      return res.json(response);
    } catch (fallbackErr) {
      console.error("[AI Brief] Gemini failed:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
      const response = { brief: ruleBrief, model: "rule", generatedAt: new Date().toISOString() };
      briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
      return res.json(response);
    }
  }
}));

export default briefRouter;
