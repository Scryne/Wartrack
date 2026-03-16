export interface ReliabilityInput {
  source: string;
  title: string;
  description?: string | null;
  pubDate?: string | null;
  corroborationCount?: number;
}

export interface ReliabilityResult {
  reliabilityScore: number;
  confidenceLabel: "Düşük" | "Orta" | "Yüksek";
  reliabilitySignals: string[];
  insufficientData: boolean;
}

const SOURCE_BASELINE: Record<string, number> = {
  "Reuters World": 82,
  "AP News": 80,
  "BBC World": 79,
  "Guardian World": 75,
  "France24 EN": 72,
  "DW World": 71,
  "Al Jazeera": 70,
  "Times of Israel": 66,
  "Jerusalem Post": 63,
  "Middle East Eye": 58,
  "Iran Int'l": 57,
  "Haaretz EN": 68,
  "Defense One": 74,
  "War on the Rocks": 69,
  ISW: 73
};

const SPECULATIVE_KW = ["iddia", "unconfirmed", "rumor", "alleged", "kaynaklar", "claims"];
const EVIDENCE_KW = ["official", "doğrulandı", "satellite", "uydu", "statement", "ministry", "bakanlık"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getRecencyScore(pubDate?: string | null): number {
  if (!pubDate) return 8;
  const diffHours = Math.max(0, (Date.now() - new Date(pubDate).getTime()) / 3_600_000);
  if (diffHours <= 6) return 16;
  if (diffHours <= 24) return 12;
  if (diffHours <= 72) return 8;
  return 4;
}

function detectSignalScore(text: string): { delta: number; signals: string[] } {
  const normalized = text.toLocaleLowerCase("tr-TR");
  const signals: string[] = [];
  let delta = 0;

  if (SPECULATIVE_KW.some((kw) => normalized.includes(kw))) {
    delta -= 12;
    signals.push("Metinde spekülatif ifade sinyali var");
  }
  if (EVIDENCE_KW.some((kw) => normalized.includes(kw))) {
    delta += 8;
    signals.push("Metinde kanıt/dogrulama sinyali var");
  }

  return { delta, signals };
}

export function computeReliability(input: ReliabilityInput): ReliabilityResult {
  const baseline = SOURCE_BASELINE[input.source] ?? 52;
  const recency = getRecencyScore(input.pubDate);
  const corroboration = clamp((input.corroborationCount ?? 1) * 4, 0, 16);
  const signal = detectSignalScore(`${input.title} ${input.description ?? ""}`);

  const raw = baseline * 0.65 + recency + corroboration + signal.delta;
  const reliabilityScore = clamp(Math.round(raw), 0, 100);
  const insufficientData = !input.title || !input.source;

  let confidenceLabel: ReliabilityResult["confidenceLabel"] = "Düşük";
  if (reliabilityScore >= 75) confidenceLabel = "Yüksek";
  else if (reliabilityScore >= 50) confidenceLabel = "Orta";

  const reliabilitySignals = [
    `Kaynak taban puanı: ${baseline}`,
    `Zaman tazeliği katkısı: +${recency}`,
    `Çapraz doğrulama katkısı: +${corroboration}`,
    ...signal.signals
  ];

  return { reliabilityScore, confidenceLabel, reliabilitySignals, insufficientData };
}
