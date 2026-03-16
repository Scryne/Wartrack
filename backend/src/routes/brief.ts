import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import db from "../db";
import { sanitizeAiOutput, validateTurkishOutput } from "../lib/languageGuard";

const briefRouter = Router();

interface BriefArticleRow {
  id: number;
  title: string;
  description: string | null;
  source: string;
  pubDate: string;
  aiSummary: string | null;
}

const getRecentArticlesStmt = db.prepare(`
  SELECT id, title, description, source, pubDate, aiSummary
  FROM articles
  WHERE pubDate > datetime('now', '-6 hours')
  ORDER BY pubDate DESC
  LIMIT 80
`);

const BRIEF_CACHE_TTL_MS = 90_000;
const BRIEF_MODEL_ENABLED = (process.env.BRIEF_MODEL_ENABLED ?? "0") === "1";

let briefCache: {
  key: string;
  brief: string;
  model: string;
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

const BRIEF_SYSTEM_PROMPT = `Sen İran-İsrail çatışmasını izleyen kıdemli bir askeri analistsin.
Yalnızca verilen haber bağlamına dayanarak Türkçe durum özeti üret.
Tahmin, spekülasyon, propaganda ve belirsiz iddiaları gerçek gibi yazma.
Eğer veri yetersizse bunu açıkça söyle.

Çıktı formatı zorunlu:
${BRIEF_HEADINGS.summary}
- ...
- ...

${BRIEF_HEADINGS.critical}
...

${BRIEF_HEADINGS.trend}
...

Başka başlık, giriş, kapanış veya ek not yazma.`;

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

let geminiModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

function getGeminiModel() {
  if (!geminiModel && GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_KEY_HERE") {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
        stream: false
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

async function geminiBrief(prompt: string): Promise<string> {
  const model = getGeminiModel();
  if (!model) throw new Error("Gemini API key not configured");

  const result = await model.generateContent({
    systemInstruction: BRIEF_SYSTEM_PROMPT,
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  } as any);

  return result.response.text().trim();
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

function inferTopic(text: string): "saldiri" | "diplomasi" | "lojistik" | "sivil" | "genel" {
  if (/(missile|drone|strike|attack|airstrike|bomb|fuze|saldiri|taarruz|ih[ai])/i.test(text)) return "saldiri";
  if (/(talk|ceasefire|diplom|meeting|anlasma|ateskes|gorus)/i.test(text)) return "diplomasi";
  if (/(hormuz|strait|port|ship|fuel|energy|navy|marine|lojistik|sevkiyat)/i.test(text)) return "lojistik";
  if (/(civilian|hospital|medic|casualt|yarali|sivil|hastane|acil)/i.test(text)) return "sivil";
  return "genel";
}

function articleScore(article: BriefArticleRow): number {
  const text = `${article.title} ${article.description ?? ""} ${article.aiSummary ?? ""}`;
  const relevance = RELEVANCE_PATTERNS.reduce((acc, re) => (re.test(text) ? acc + 1 : acc), 0);
  const noise = NOISE_PATTERNS.some((re) => re.test(text)) ? 2 : 0;
  const recencyHours = Math.max(0, (Date.now() - new Date(article.pubDate).getTime()) / 3_600_000);
  const recencyBonus = recencyHours <= 2 ? 3 : recencyHours <= 6 ? 2 : 1;
  return relevance * 3 + recencyBonus - noise;
}

function summarizeArticleForBrief(article: BriefArticleRow): string {
  const safeAi = article.aiSummary ? normalizeLine(article.aiSummary) : "";
  const hasForeignNoise = /\b(the|and|with|from|into|under|over|retaliatory|direct|service|support|analysis|ongoing|thousands|daily|breaking)\b/i.test(safeAi);
  if (safeAi && validateTurkishOutput(safeAi).valid && !hasForeignNoise) return safeAi;

  const combined = `${article.title} ${article.description ?? ""}`;
  const topic = inferTopic(combined);
  if (topic === "saldiri") return `${article.source} kaynağına göre saldırı odaklı askeri gerilim sürüyor.`;
  if (topic === "diplomasi") return `${article.source} kaynağına göre diplomatik temaslar devam ediyor ancak gerilim tamamen düşmüş değil.`;
  if (topic === "lojistik") return `${article.source} kaynağına göre enerji ve lojistik hatlarına ilişkin riskler gündemde.`;
  if (topic === "sivil") return `${article.source} kaynağına göre gelişmelerin sivil etki riski devam ediyor.`;
  return `${article.source} kaynağında bölgesel güvenlik dengesine dair temkinli görünüm öne çıkıyor.`;
}

function buildRuleBasedBrief(allArticles: BriefArticleRow[]): string {
  const scored = allArticles
    .map((a) => ({ article: a, score: articleScore(a) }))
    .sort((a, b) => b.score - a.score || +new Date(b.article.pubDate) - +new Date(a.article.pubDate));

  const relevant = scored.filter((row) => row.score > 2).slice(0, 16);
  const chosen = (relevant.length > 0 ? relevant : scored.slice(0, 10)).map((row) => row.article);

  const uniqueBullets: string[] = [];
  const usedTopics = new Set<string>();
  for (const article of chosen) {
    const topic = inferTopic(`${article.title} ${article.description ?? ""}`);
    const line = summarizeArticleForBrief(article);
    if (!line || uniqueBullets.includes(line)) continue;
    if (uniqueBullets.length < 2 && usedTopics.has(topic)) continue;
    uniqueBullets.push(line);
    usedTopics.add(topic);
    if (uniqueBullets.length >= 4) break;
  }

  const topicCount = { saldiri: 0, diplomasi: 0, lojistik: 0, sivil: 0, genel: 0 } as Record<string, number>;
  for (const article of chosen) {
    topicCount[inferTopic(`${article.title} ${article.description ?? ""}`)] += 1;
  }

  let critical = "Kritik düzeyde yeni teyitli kırılım tespit edilmedi.";
  const criticalCandidate = chosen.find((a) => inferTopic(`${a.title} ${a.description ?? ""}`) === "saldiri");
  if (criticalCandidate) {
    critical = `${criticalCandidate.source} akışına göre saldırı odaklı askeri baskı sürüyor; kısa vadede tırmanma riski dikkatle izleniyor.`;
  }

  let trend = "Veri akışı genel olarak dalgalı fakat kontrol edilebilir bir gerilim görünümü veriyor.";
  if (topicCount.saldiri >= 3) {
    trend = "Saldırı içerikli başlık yoğunluğu nedeniyle trend tırmanma yönünde; sivil etki riski yüksek seyrediyor.";
  } else if (topicCount.diplomasi >= 2 && topicCount.saldiri <= 1) {
    trend = "Diplomatik temasların artmasıyla trendde kontrollü yumuşama sinyali var; sahada risk tamamen bitmiş değil.";
  } else if (topicCount.lojistik >= 2) {
    trend = "Enerji ve lojistik hatları etrafındaki baskı trendi kırılgan tutuyor; ikincil etkiler büyüyebilir.";
  }

  const bullets = uniqueBullets.length > 0 ? uniqueBullets : ["Son 6 saatte anlamlı ve doğrulanabilir özet verisi sınırlı kaldı."];
  if (bullets.length < 3) {
    if (topicCount.saldiri > 0) bullets.push("Saldırı içerikli haber yoğunluğu operasyonel riskin canlı kaldığını gösteriyor.");
    if (topicCount.diplomasi > 0) bullets.push("Diplomatik başlıklar sahadaki askeri baskıyı dengeleyecek güçte görünmüyor.");
    if (topicCount.sivil > 0) bullets.push("Sivil etki riski halen öne çıkan ana kırılganlık alanı olarak izleniyor.");
  }
  while (bullets.length < 3) {
    bullets.push("Kaynak akışı izlenmeye devam ediyor; teyitli yeni veri geldikçe değerlendirme güncellenecek.");
  }

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

function ensureBriefSections(text: string): string {
  const clean = normalizeBrief(text);
  const langValidation = validateTurkishOutput(clean);
  if (!langValidation.valid) {
    console.warn("[AI Brief] Dil doğrulama başarısız", {
      detectedLanguage: langValidation.detectedLanguage,
      hasDisallowedScript: langValidation.hasDisallowedScript,
      reasons: langValidation.reasons
    });
    return `${BRIEF_HEADINGS.summary}
- Güvenli Türkçe özet üretilemedi, kontrol modu devrede.
- Kaynaklardan özetlenebilen başlıklar dil filtresi nedeniyle daraltıldı.

${BRIEF_HEADINGS.critical}
Kritik düzeyde doğrulanmış yeni kırılım tespit edilmedi.

${BRIEF_HEADINGS.trend}
Dil politikası doğrulaması başarısız olduğu için çıktı emniyet şablonuna alındı.`;
  }

  const hasAllSections =
    clean.includes(BRIEF_HEADINGS.summary) &&
    clean.includes(BRIEF_HEADINGS.critical) &&
    clean.includes(BRIEF_HEADINGS.trend);

  if (hasAllSections) return clean;

  return `${BRIEF_HEADINGS.summary}
- Son 6 saatlik haber akışından net bölümleme üretilemedi.
- Ham çıktıda başlık formatı eksik olduğu için güvenli şablon uygulandı.

${BRIEF_HEADINGS.critical}
Kritik düzeyde olay tespit edilemedi.

${BRIEF_HEADINGS.trend}
Model çıktısı format dışı geldiğinden trend analizi güvenli varsayım modunda tutuldu.`;
}

briefRouter.post("/", async (req, res) => {
  const articles = getRecentArticlesStmt.all() as BriefArticleRow[];
  const force = Boolean(req.body?.force);
  const cacheKey = makeBriefCacheKey(articles);
  const now = Date.now();

  if (!force && briefCache && briefCache.key === cacheKey && briefCache.expiresAt > now) {
    return res.json({ brief: briefCache.brief, model: briefCache.model, generatedAt: briefCache.generatedAt, cached: true });
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

  const ruleBrief = ensureBriefSections(buildRuleBasedBrief(articles));
  const generatedAt = new Date().toISOString();

  if (!BRIEF_MODEL_ENABLED) {
    const response = { brief: ruleBrief, model: "rule", generatedAt };
    briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
    return res.json(response);
  }

  const context = articles
    .map((a, i) => {
      const desc = a.description ? ` | ${a.description.slice(0, 220)}` : "";
      const ai = a.aiSummary ? ` — ${a.aiSummary}` : "";
      return `${i + 1}. [${a.source}] ${a.title}${desc}${ai}`;
    })
    .join("\n");

  const BRIEF_PROMPT = `Son 6 saatteki haberler aşağıda. Türkçe yanıt ver.

HABERLER:
${context}

Şu soruları yanıtla, her soru için ayrı bölüm kullan:

## SON 6 SAATİN ÖZETİ
(3-4 madde halinde en önemli gelişmeler)

## KRİTİK GELİŞME
(Varsa en kritik olay. Yoksa 'Kritik düzeyde olay tespit edilmedi.' yaz.)

## TREND ANALİZİ
(Durum tırmanıyor mu, sakinleşiyor mu, statik mi? 2-3 cümle.)

Sadece bu formatı kullan. Başka hiçbir şey ekleme.
  `;

  try {
    const result = await ollamaBrief(BRIEF_PROMPT);
      const modelBrief = ensureBriefSections(result);
      const response = { brief: modelBrief, model: "ollama", generatedAt: new Date().toISOString() };
      briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
      return res.json(response);
    } catch (err) {
      console.warn("[AI Brief] Ollama failed:", err instanceof Error ? err.message : err);

    try {
      const result = await geminiBrief(BRIEF_PROMPT);
      const modelBrief = ensureBriefSections(result);
      const response = { brief: modelBrief, model: "gemini", generatedAt: new Date().toISOString() };
      briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
      return res.json(response);
    } catch (fallbackErr) {
      console.error("[AI Brief] Gemini failed:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
      const response = { brief: ruleBrief, model: "rule", generatedAt: new Date().toISOString() };
      briefCache = { key: cacheKey, ...response, expiresAt: now + BRIEF_CACHE_TTL_MS };
      return res.json(response);
    }
  }
});

export default briefRouter;
