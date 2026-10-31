import { noul } from "@typesafe-ai/sdk";
import { getTypeSafeClient, isRetiredModelError } from "./typesafe";

/**
 * Turkish renderings of the places and actors the feeds name.
 *
 * The local 4B summarizer translated names by sound: Hormuz became "Humus"
 * (which is Homs), Tehran "Tahir" and "Tahribat", Houthi "Hüsemi", and a
 * church attack in Jordan moved to Mecca. Measured 2026-10-31 on 60 real
 * theatre stories (docs/yer-adi-denetimi.md): giving the model the names found
 * in the story cut flagged summaries from 11 to 4, and the gross errors went.
 */
export const PLACE_GLOSSARY: Record<string, string> = {
  israel: "İsrail", "tel aviv": "Tel Aviv", jerusalem: "Kudüs", haifa: "Hayfa", gaza: "Gazze",
  "west bank": "Batı Şeria", rafah: "Refah", negev: "Necef Çölü", golan: "Golan Tepeleri",
  iran: "İran", tehran: "Tahran", isfahan: "İsfahan", natanz: "Natanz", fordow: "Fordo", bushehr: "Buşehr",
  kharg: "Hark Adası", tabriz: "Tebriz", mashhad: "Meşhed", shiraz: "Şiraz", qom: "Kum",
  kermanshah: "Kirmanşah", ahvaz: "Ahvaz", "bandar abbas": "Bender Abbas", chabahar: "Çabahar", baluch: "Beluci",
  lebanon: "Lübnan", beirut: "Beyrut", sidon: "Sayda", hezbollah: "Hizbullah",
  syria: "Suriye", damascus: "Şam", aleppo: "Halep", homs: "Humus", idlib: "İdlib", tartus: "Tartus", latakia: "Lazkiye",
  jordan: "Ürdün", amman: "Amman",
  iraq: "Irak", baghdad: "Bağdat", mosul: "Musul", erbil: "Erbil", kirkuk: "Kerkük", basra: "Basra",
  yemen: "Yemen", sanaa: "Sana", aden: "Aden", hodeidah: "Hudeyde", marib: "Marib", houthi: "Husi",
  "red sea": "Kızıldeniz", hormuz: "Hürmüz Boğazı", "bab el-mandeb": "Babülmendep Boğazı", mandeb: "Babülmendep Boğazı",
  "persian gulf": "Basra Körfezi", gulf: "Körfez",
  saudi: "Suudi Arabistan", riyadh: "Riyad", mecca: "Mekke", qatar: "Katar", doha: "Doha",
  bahrain: "Bahreyn", kuwait: "Kuveyt", uae: "Birleşik Arap Emirlikleri", emirates: "Birleşik Arap Emirlikleri",
  "abu dhabi": "Abu Dabi", dubai: "Dubai", oman: "Umman", muscat: "Maskat",
  turkey: "Türkiye", istanbul: "İstanbul", ankara: "Ankara", egypt: "Mısır", cairo: "Kahire", suez: "Süveyş",
  cyprus: "Kıbrıs", pakistan: "Pakistan",
  eilat: "Eilat", ashdod: "Aşdod", dimona: "Dimona", hebron: "El Halil", jenin: "Cenin", nablus: "Nablus",
  ramallah: "Ramallah", bethlehem: "Beytüllahim", tulkarm: "Tulkerim", "khan younis": "Han Yunus", hamas: "Hamas",
  irgc: "Devrim Muhafızları (IRGC)", "revolutionary guard": "Devrim Muhafızları", idf: "İsrail ordusu (IDF)"
};

// Longest first so "persian gulf" is listed instead of "gulf", "tel aviv" before "israel".
const GLOSSARY_ENTRIES: [RegExp, string, string][] = Object.entries(PLACE_GLOSSARY)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, tr]) => [new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), key, tr]);

/** "Source name = Turkish name" lines for the places `text` mentions, each Turkish name once. */
export function placeGlossaryFor(text: string): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  let remaining = text;
  for (const [pattern, key, tr] of GLOSSARY_ENTRIES) {
    const match = pattern.exec(remaining);
    if (!match) continue;
    // Blank the matched span so "gulf" does not re-match inside "Persian Gulf".
    remaining = remaining.slice(0, match.index) + " ".repeat(key.length) + remaining.slice(match.index + key.length);
    if (seen.has(tr)) continue;
    seen.add(tr);
    lines.push(`${text.slice(match.index, match.index + key.length)} = ${tr}`);
  }
  return lines;
}

/** The news text for the summarizer, with the glossary appended when it applies. */
export function withPlaceGlossary(text: string): string {
  const lines = placeGlossaryFor(text);
  if (lines.length === 0) return text;
  return `${text}\n\nYer ve kurum adlarının Türkçe yazımı (bunları aynen kullan):\n${lines.join("\n")}`;
}

/**
 * Place fidelity: does every place in the Turkish summary match a place in the
 * source? Same 60 stories: glossary summaries never fell below 0.3, while the
 * gross errors of the unaided run scored 0.05–0.2. Subtle sound-alikes ("Tahir"
 * at 0.53) are not reliably caught, which is why the glossary is the primary fix.
 */
export const PLACE_CHECK_MODEL = "jev-1.14.0";
export const PLACE_CHECK_THRESHOLD = 0.3;

const PLACE_QUESTION = noul(
  "Every place named in the Turkish summary (`summary`) is a correct Turkish rendering of a place named in the English source (`source`), and no place has been replaced by a different place.",
  {
    true: "All places in the summary are the same places as in the source, written in Turkish or left in the original form (e.g. Hormuz → Hürmüz, Damascus → Şam, Red Sea → Kızıldeniz).",
    false: "At least one place in the summary is a different place, a wrong or invented name, or a mistranslation of the source's place (e.g. Hormuz → Humus, Riyadh → Rize)."
  }
);

export interface PlaceCheck {
  ok: boolean;
  /** Probability of fidelity; null when the check did not run. */
  p: number | null;
}

let placeModel = PLACE_CHECK_MODEL;

export async function checkSummaryPlaces(source: string, summary: string): Promise<PlaceCheck> {
  const client = process.env.SUMMARY_PLACE_CHECK === "0" ? null : getTypeSafeClient();
  if (!client) return { ok: true, p: null };
  try {
    const res = await client.systemOne({
      model: placeModel,
      state: { source: source.slice(0, 1500), summary },
      questions: { places: PLACE_QUESTION }
    });
    const p = res.answers.places.noul;
    return { ok: p >= PLACE_CHECK_THRESHOLD, p };
  } catch (err) {
    if (isRetiredModelError(err) && placeModel !== "jev-latest") {
      placeModel = "jev-latest";
      return checkSummaryPlaces(source, summary);
    }
    // A checker outage must not block summaries; the glossary still applied.
    console.warn("[AI] Yer adı denetimi çalışmadı:", String(err));
    return { ok: true, p: null };
  }
}
