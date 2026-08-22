import db from "../db";

export const CORROBORATION_ALGORITHM_VERSION = "v2.1-tactical";

export interface CorroboratedCluster {
  clusterId: string;
  primaryEvent: {
    id: number;
    title: string;
    type: string;
    severity: string;
    source: string | null;
    lat: number | null;
    lng: number | null;
    createdAt: string;
  };
  eventIds: number[];
  sources: string[];
  independentSourceCount: number;
  sourceClusters: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  confidenceScore: number;
  conflictingReports: boolean;
  firstReportedAt: string;
  lastReportedAt: string;
  summary: string;
  algorithmVersion: string;
  evidenceSummary?: {
    avgSemanticSimilarity: number;
    maxDistanceKm: number | null;
    sharedTacticalTokens: string[];
  };
}

export interface CorroborationEvidence {
  isMatch: boolean;
  geographicDistanceKm: number | null;
  geographicScore: number;
  temporalDiffHours: number;
  temporalScore: number;
  semanticSimilarity: number;
  sharedTokens: string[];
  targetConflict: boolean;
  hardSplitReason: string | null;
  confidenceScore: number;
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  algorithmVersion: string;
}

interface RawEvent {
  id: number;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  source: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

const SPECULATIVE_PATTERNS = [/unconfirmed/i, /iddia/i, /rumor/i, /alleged/i, /çelişkili/i, /celiskili/i, /claimed/i, /yalanla/i];
const VERIFIED_ORGANIZATIONS = ["ISW", "Defense One", "War on the Rocks", "Reuters", "BBC World", "AP News", "AFP"];

/**
 * Normalizes Turkish and English strings to standard ASCII-lowercase for deterministic token matching.
 */
export function normalizeCrossLanguageText(str: string): string {
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

/**
 * Tactical synonym taxonomy without duplicate mappings.
 * Each semantic concept maps strictly to a single canonical token.
 */
export const TACTICAL_SYNONYMS: Array<{ pattern: RegExp; canonical: string }> = [
  // Tactical Target & Facility Types
  { pattern: /\b(subterranean|underground|bunkers?|fortified|fortifications?|s[i]g[i]nak|yer\s*alt[i]|tahkimat)\b/gi, canonical: "__target_bunker__" },
  { pattern: /\b(airports?|airfields?|runways?|hangars?|aerospace|airbase|havaalan[i]|havaliman[i]|hava\s*ussu|pist|hangar)\b/gi, canonical: "__target_airport__" },
  { pattern: /\b(ports?|harbors?|docks?|piers?|terminals?|naval\s*berths?|maritime|naval|liman|iskele|riht[i]m|deniz\s*ussu|sahil)\b/gi, canonical: "__target_port__" },
  { pattern: /\b(depots?|warehouses?|munitions?|ammunition|storage|armaments?|depo|muhimmat\s*deposu|lojistik\s*depo|ambar|silah|cephanelik)\b/gi, canonical: "__target_depot__" },
  { pattern: /\b(radars?|sensors?|surveillance|tracking|radar\s*istasyonu|erken\s*uyar[i])\b/gi, canonical: "__target_radar__" },
  { pattern: /\b(convoys?|transports?|columns?|trucks?|shipments?|konvoy|lojistik\s*arac|sevkiyat|tas[i]yan)\b/gi, canonical: "__target_convoy__" },
  { pattern: /\b(pipelines?|refiner(?:y|ies)|petroleum|gas\s*pipeline|oil\s*terminal|boru\s*hatt[i]|rafineri|petrol|dogalgaz)\b/gi, canonical: "__target_energy__" },
  { pattern: /\b(satellites?|orbits?|orbital|exo-atmospheric|uydu|yorunge)\b/gi, canonical: "__target_satellite__" },
  { pattern: /\b(facility|facilities|installation|installations?|complex|base|headquarters|barracks|tesis|tesisler|karargah|askeri\s*us|kisl[a|e])\b/gi, canonical: "__target_facility__" },

  // Drill & Training vs Combat Conflict Guard
  { pattern: /\b(drills?|exercises?|simulation|simulating|tatbikat|tatbikati|egitim|egitimi)\b/gi, canonical: "__context_drill__" },

  // Tactical Actions
  { pattern: /\b(airstrikes?|air\s*raids?|bombings?|bombardments?|aerial|bomb|bombed|hava\s*saldiris[i]|hava\s*harekat[i]|bombaland[i]|bombard[i]man)\b/gi, canonical: "__act_strike__" },
  { pattern: /\b(drones?|uavs?|quadcopters?|unmanned|iha|siha|dron|insans[i]z\s*hava\s*arac[i]|kamikaze)\b/gi, canonical: "__act_drone__" },
  { pattern: /\b(missiles?|rockets?|ballistic|projectiles?|salvo|salvos|barrages?|fuze|roket|balistik|salvo|baraj\s*atesi)\b/gi, canonical: "__act_missile__" },
  { pattern: /\b(intercepted|interceptions?|downed|shot\s*down|engaged|engellendi|engelledi|dusuruldu|dusurdu|onlendi|onledi|imha\s*edildi|imha\s*etti|kars[i]l[i]k\s*verdi)\b/gi, canonical: "__act_intercept__" },
  { pattern: /\b(explosions?|blasts?|detonations?|detonated|sabotage|patlama|infilak|patlat[i]ld[i]|sabotaj)\b/gi, canonical: "__act_explosion__" },
  { pattern: /\b(skirmishes?|clashes?|combats?|gunfire|duels?|firefight|ambush|ambushed|cat[i]sma|silahl[i]\s*cat[i]sma|munakasa|pusu)\b/gi, canonical: "__act_clash__" },
  { pattern: /\b(artillery|howitzers?|cannons?|shelling|shells?|topcu|top\s*at[i]s[i]|top\s*mermisi|obus)\b/gi, canonical: "__act_artillery__" },
  { pattern: /\b(electronic\s*warfare|gps\s*jamming|countermeasures?|jamming|elektronik\s*harp|karistirma|sinyal\s*kesici)\b/gi, canonical: "__act_ew__" },
  { pattern: /\b(cyber|cyberattack|malware|scada|telemetry|siber|siber\s*saldiri|zararli\s*yazilim)\b/gi, canonical: "__act_cyber__" },
  { pattern: /\b(pirates?|piracy|boarding|boarded|hijacked|hijacking|korsan|korsanlar|baskin|gemi\s*kacirma|el\s*koydu)\b/gi, canonical: "__act_piracy__" },
  { pattern: /\b(periscopes?|submarines?|reconnaissance|patrol|surveillance\s*flight|gozetleme|kesif|denizalti)\b/gi, canonical: "__act_recon__" },
  { pattern: /\b(protests?|rally|rallies|demonstrators?|demonstrations?|march|marched|riot|riots|rioting|prisoners?|prison|detention|protesto|yuruyus|gosteri|eylem|isyan|cezaevi|tutukevi)\b/gi, canonical: "__act_civil__" },
  { pattern: /\b(refutes?|refuted|refuting|dismisses?|dismissed|denies|denied|denial|operating\s*normally|fake\s*news|hoax|yalanlad[i]|asilsiz|gercegi\s*yansitmiyor|yalanlama)\b/gi, canonical: "__context_denial__" },
  { pattern: /\b(claims?|claimed|unconfirmed|alleged|rumors?|iddia|iddias[i]|dogrulanmam[i]s|soylenti)\b/gi, canonical: "__context_claim__" },
  { pattern: /\b(struck|strike|hits?|targeted|bombing|vurdu|vuruldu|hedef\s*ald[i]|hedef\s*al[i]nd[i]|isabet\s*etti|imha)\b/gi, canonical: "__act_hit__" },
  { pattern: /\b(casualties|deaths?|killed|wounded|injured|fatalities|olu|yaral[i]|kay[i]p|can\s*kayb[i]|sehit)\b/gi, canonical: "__context_casualty__" },

  // Location / Regional Gazetteer
  { pattern: /\b(damascus|sam)\b/gi, canonical: "__loc_damascus__" },
  { pattern: /\b(beirut|beyrut|dahiyeh)\b/gi, canonical: "__loc_beirut__" },
  { pattern: /\b(isfahan)\b/gi, canonical: "__loc_isfahan__" },
  { pattern: /\b(tehran|tahran)\b/gi, canonical: "__loc_tehran__" },
  { pattern: /\b(aleppo|halep)\b/gi, canonical: "__loc_aleppo__" },
  { pattern: /\b(hodeidah|hudeyde)\b/gi, canonical: "__loc_hodeidah__" },
  { pattern: /\b(eilat|elat)\b/gi, canonical: "__loc_eilat__" },
  { pattern: /\b(tel\s*aviv)\b/gi, canonical: "__loc_telaviv__" },
  { pattern: /\b(baghdad|bagdat)\b/gi, canonical: "__loc_baghdad__" },
  { pattern: /\b(gaza|gazze)\b/gi, canonical: "__loc_gaza__" },
  { pattern: /\b(jerusalem|kudus)\b/gi, canonical: "__loc_jerusalem__" },
  { pattern: /\b(latakia|lazkiye)\b/gi, canonical: "__loc_latakia__" },
  { pattern: /\b(tabriz|tebriz)\b/gi, canonical: "__loc_tabriz__" },
  { pattern: /\b(kermanshah|kirmansah)\b/gi, canonical: "__loc_kermanshah__" },
  { pattern: /\b(tripoli|trablus)\b/gi, canonical: "__loc_tripoli__" },
  { pattern: /\b(riyadh|riyad)\b/gi, canonical: "__loc_riyadh__" },
  { pattern: /\b(sanaa|sana)\b/gi, canonical: "__loc_sana__" }
];

const STOPWORDS = new Set([
  "reported", "central", "military", "defense", "security", "regional", "confirmed",
  "forces", "active", "zone", "area", "near", "units", "statement", "official",
  "local", "sources", "following", "across", "hours", "after", "with", "from",
  "into", "over", "that", "this", "under", "about", "have", "been", "were", "will",
  "bolgesinde", "yakinlarinda", "tarafindan", "olarak", "kaynaklar", "resmi",
  "askeri", "guvenlik", "merkezi", "gerceklesti", "bildirdi", "aktardi"
]);

export function extractTokens(str: string): Set<string> {
  const normalized = normalizeCrossLanguageText(str);
  const canonicalTokens = new Set<string>();

  for (const { pattern, canonical } of TACTICAL_SYNONYMS) {
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) {
      canonicalTokens.add(canonical);
    }
  }

  const rawTokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));

  for (const t of rawTokens) {
    canonicalTokens.add(t);
  }

  return canonicalTokens;
}

export function extractPrefixTokens(tokens: Set<string>, prefix: string): Set<string> {
  const extracted = new Set<string>();
  for (const t of tokens) {
    if (t.startsWith(prefix)) {
      extracted.add(t);
    }
  }
  return extracted;
}

export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize++;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Calculates geographic distance in kilometers using the Great Circle Haversine formula,
 * enforcing valid geographic bounds [-90, 90] and [-180, 180].
 */
export function calculateDistanceKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null
): number {
  if (
    lat1 === null ||
    lng1 === null ||
    lat2 === null ||
    lng2 === null ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2) ||
    lat1 < -90 ||
    lat1 > 90 ||
    lat2 < -90 ||
    lat2 > 90 ||
    lng1 < -180 ||
    lng1 > 180 ||
    lng2 < -180 ||
    lng2 > 180
  ) {
    return Infinity;
  }

  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resolves true independent sources by identifying primary news wire attributions
 * to avoid counting syndicated duplicate reporting as multiple independent sources.
 */
export function resolveIndependentSourceCount(
  events: Array<{ source: string | null; title: string; description: string | null }>
): { independentCount: number; sourceClusters: string[]; primaryAttributions: string[] } {
  const clusterSet = new Set<string>();
  const attributions: string[] = [];

  for (const ev of events) {
    const text = `${ev.title} ${ev.description ?? ""}`.toLowerCase();
    let primary = ev.source ? normalizeCrossLanguageText(ev.source).trim() : "unknown";

    // Detect cited wire agencies in text
    if (text.includes("reuters")) {
      primary = "wire:reuters";
    } else if (text.includes("associated press") || text.includes("ap news") || /\bap\b/.test(text)) {
      primary = "wire:ap";
    } else if (text.includes("afp") || text.includes("agence france-presse")) {
      primary = "wire:afp";
    } else if (text.includes("anadolu ajans") || text.includes("anadolu agency") || text.includes("aa:")) {
      primary = "wire:aa";
    } else if (text.includes("sana") || text.includes("suriye resmi ajans")) {
      primary = "wire:sana";
    } else if (text.includes("tass")) {
      primary = "wire:tass";
    } else if (text.includes("isw") || text.includes("understandingwar")) {
      primary = "org:isw";
    } else if (text.includes("bbc")) {
      primary = "org:bbc";
    }

    attributions.push(primary);
    clusterSet.add(primary);
  }

  return {
    independentCount: Math.max(clusterSet.size, 1),
    sourceClusters: Array.from(clusterSet),
    primaryAttributions: attributions
  };
}

/**
 * Evaluates pairwise event corroboration with complete structured explainability.
 */
export function evaluatePairwiseCorroboration(
  ev1: { lat: number | null; lng: number | null; tokens: Set<string>; hoursAgo?: number },
  ev2: { lat: number | null; lng: number | null; tokens: Set<string>; hoursAgo?: number }
): CorroborationEvidence {
  const locs1 = extractPrefixTokens(ev1.tokens, "__loc_");
  const locs2 = extractPrefixTokens(ev2.tokens, "__loc_");

  const sharedTokensList: string[] = [];
  for (const t of ev1.tokens) {
    if (ev2.tokens.has(t)) sharedTokensList.push(t);
  }

  const distKm = calculateDistanceKm(ev1.lat, ev1.lng, ev2.lat, ev2.lng);
  const temporalDiff = Math.abs((ev1.hoursAgo ?? 0) - (ev2.hoursAgo ?? 0));
  const sim = calculateJaccardSimilarity(ev1.tokens, ev2.tokens);
  const sharedCount = sharedTokensList.length;

  // 0. Hard Temporal Window Gate: incidents > 6.0 hours apart are distinct operational windows
  if (temporalDiff > 6.0) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm === Infinity ? null : distKm,
      geographicScore: distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.5,
      temporalDiffHours: temporalDiff,
      temporalScore: 0,
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: false,
      hardSplitReason: "TEMPORAL_WINDOW_EXCEEDED",
      confidenceScore: 0.05,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  // 1. Location Contradiction Check
  if (locs1.size > 0 && locs2.size > 0) {
    let hasSharedLoc = false;
    for (const loc of locs1) {
      if (locs2.has(loc)) {
        hasSharedLoc = true;
        break;
      }
    }
    if (!hasSharedLoc) {
      return {
        isMatch: false,
        geographicDistanceKm: distKm === Infinity ? null : distKm,
        geographicScore: 0,
        temporalDiffHours: temporalDiff,
        temporalScore: Math.max(0, 1 - temporalDiff / 6),
        semanticSimilarity: sim,
        sharedTokens: sharedTokensList,
        targetConflict: false,
        hardSplitReason: "LOCATION_CONTRADICTION",
        confidenceScore: 0.1,
        confidenceLabel: "LOW",
        algorithmVersion: CORROBORATION_ALGORITHM_VERSION
      };
    }
  }

  // 2. Training Drill vs Hostile Combat Contradiction
  const drill1 = ev1.tokens.has("__context_drill__");
  const drill2 = ev2.tokens.has("__context_drill__");
  const claim1 = ev1.tokens.has("__context_claim__");
  const claim2 = ev2.tokens.has("__context_claim__");

  if (drill1 !== drill2 && !claim1 && !claim2) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm === Infinity ? null : distKm,
      geographicScore: distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.5,
      temporalDiffHours: temporalDiff,
      temporalScore: Math.max(0, 1 - temporalDiff / 6),
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: false,
      hardSplitReason: "DRILL_VS_COMBAT_CONFLICT",
      confidenceScore: 0.1,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  // 3. Civil Protest vs Military Action Contradiction
  const civil1 = ev1.tokens.has("__act_civil__");
  const civil2 = ev2.tokens.has("__act_civil__");
  const isMilitary1 =
    ev1.tokens.has("__act_strike__") ||
    ev1.tokens.has("__act_missile__") ||
    ev1.tokens.has("__act_drone__") ||
    ev1.tokens.has("__act_artillery__") ||
    ev1.tokens.has("__act_clash__") ||
    ev1.tokens.has("__act_hit__") ||
    ev1.tokens.has("__target_depot__") ||
    ev1.tokens.has("__target_bunker__");
  const isMilitary2 =
    ev2.tokens.has("__act_strike__") ||
    ev2.tokens.has("__act_missile__") ||
    ev2.tokens.has("__act_drone__") ||
    ev2.tokens.has("__act_artillery__") ||
    ev2.tokens.has("__act_clash__") ||
    ev2.tokens.has("__act_hit__") ||
    ev2.tokens.has("__target_depot__") ||
    ev2.tokens.has("__target_bunker__");

  if (civil1 !== civil2 && (isMilitary1 || isMilitary2)) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm === Infinity ? null : distKm,
      geographicScore: distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.5,
      temporalDiffHours: temporalDiff,
      temporalScore: Math.max(0, 1 - temporalDiff / 6),
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: false,
      hardSplitReason: "CIVIL_VS_MILITARY_CONFLICT",
      confidenceScore: 0.05,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  // 4. Official Denial / Refutation vs Positive Event Contradiction
  const denial1 = ev1.tokens.has("__context_denial__");
  const denial2 = ev2.tokens.has("__context_denial__");
  if (
    denial1 !== denial2 &&
    (isMilitary1 || isMilitary2 || ev1.tokens.has("__act_explosion__") || ev2.tokens.has("__act_explosion__"))
  ) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm === Infinity ? null : distKm,
      geographicScore: distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.5,
      temporalDiffHours: temporalDiff,
      temporalScore: Math.max(0, 1 - temporalDiff / 6),
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: false,
      hardSplitReason: "DENIAL_VS_EVENT_CONFLICT",
      confidenceScore: 0.05,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  // 5. Pure Reconnaissance vs Kinetic Strike Contradiction
  const recon1 = ev1.tokens.has("__act_recon__");
  const recon2 = ev2.tokens.has("__act_recon__");
  const isKinetic1 =
    ev1.tokens.has("__act_strike__") ||
    ev1.tokens.has("__act_drone__") ||
    ev1.tokens.has("__act_missile__") ||
    ev1.tokens.has("__act_hit__");
  const isKinetic2 =
    ev2.tokens.has("__act_strike__") ||
    ev2.tokens.has("__act_drone__") ||
    ev2.tokens.has("__act_missile__") ||
    ev2.tokens.has("__act_hit__");
  const pureRecon1 = recon1 && !isKinetic1;
  const pureRecon2 = recon2 && !isKinetic2;

  if (pureRecon1 !== pureRecon2 && (isKinetic1 || isKinetic2) && !ev1.tokens.has("__act_clash__") && !ev2.tokens.has("__act_clash__")) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm === Infinity ? null : distKm,
      geographicScore: distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.5,
      temporalDiffHours: temporalDiff,
      temporalScore: Math.max(0, 1 - temporalDiff / 6),
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: false,
      hardSplitReason: "RECON_VS_KINETIC_CONFLICT",
      confidenceScore: 0.05,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  // 6. Target / Facility Conflict
  const SPECIFIC_TARGETS = new Set([
    "__target_airport__",
    "__target_port__",
    "__target_depot__",
    "__target_bunker__",
    "__target_radar__",
    "__target_convoy__",
    "__target_energy__",
    "__target_satellite__"
  ]);
  const targets1 = extractPrefixTokens(ev1.tokens, "__target_");
  const targets2 = extractPrefixTokens(ev2.tokens, "__target_");
  const specTargets1 = new Set([...targets1].filter((t) => SPECIFIC_TARGETS.has(t)));
  const specTargets2 = new Set([...targets2].filter((t) => SPECIFIC_TARGETS.has(t)));

  let hasTargetConflict = false;
  if (specTargets1.size > 0 && specTargets2.size > 0) {
    const hasShared = [...specTargets1].some((t) => specTargets2.has(t));
    if (!hasShared) {
      hasTargetConflict = true;
    }
  }

  if (hasTargetConflict && (distKm > 2 || distKm === Infinity)) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm === Infinity ? null : distKm,
      geographicScore: distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.2,
      temporalDiffHours: temporalDiff,
      temporalScore: Math.max(0, 1 - temporalDiff / 6),
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: true,
      hardSplitReason: "FACILITY_TARGET_CONFLICT",
      confidenceScore: 0.15,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  // Multi-Signal Decision Matrix
  if (distKm !== Infinity && distKm > 50) {
    return {
      isMatch: false,
      geographicDistanceKm: distKm,
      geographicScore: 0,
      temporalDiffHours: temporalDiff,
      temporalScore: Math.max(0, 1 - temporalDiff / 6),
      semanticSimilarity: sim,
      sharedTokens: sharedTokensList,
      targetConflict: hasTargetConflict,
      hardSplitReason: "GEOGRAPHIC_DISTANCE_EXCEEDED",
      confidenceScore: 0.05,
      confidenceLabel: "LOW",
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  }

  let isMatch: boolean;
  if (distKm !== Infinity) {
    if (distKm <= 2) {
      isMatch = sim >= 0.05 || sharedCount >= 1;
    } else if (distKm <= 10) {
      isMatch = !hasTargetConflict && (sim >= 0.08 || sharedCount >= 2);
    } else if (distKm <= 25) {
      isMatch = !hasTargetConflict && (sim >= 0.15 || sharedCount >= 3);
    } else {
      // 25km - 50km: High-confidence regional match requiring strong overlap and matching action/target
      // Prohibits localized ground clashes or artillery from merging across 25-50km
      const isLocalGround1 = ev1.tokens.has("__act_clash__") || ev1.tokens.has("__act_artillery__");
      const isLocalGround2 = ev2.tokens.has("__act_clash__") || ev2.tokens.has("__act_artillery__");
      const sharedActions = [...ev1.tokens].filter((t) => t.startsWith("__act_") && ev2.tokens.has(t));
      const sharedTargets = [...ev1.tokens].filter((t) => t.startsWith("__target_") && ev2.tokens.has(t));

      isMatch =
        !hasTargetConflict &&
        !isLocalGround1 &&
        !isLocalGround2 &&
        sim >= 0.35 &&
        sharedCount >= 4 &&
        (sharedActions.length > 0 || sharedTargets.length > 0);
    }
  } else {
    // Non-geocoded events: Corroborate if high similarity, >=3 shared tokens, or shared tactical action + specific target
    const sharedActions = [...ev1.tokens].filter((t) => t.startsWith("__act_") && ev2.tokens.has(t));
    const sharedSpecificTargets = [...ev1.tokens].filter((t) => SPECIFIC_TARGETS.has(t) && ev2.tokens.has(t));
    isMatch =
      !hasTargetConflict &&
      (sim >= 0.25 || sharedCount >= 3 || (sharedActions.length > 0 && sharedSpecificTargets.length > 0));
  }

  const geoScore = distKm !== Infinity ? Math.max(0, 1 - distKm / 50) : 0.5;
  const tempScore = Math.max(0, 1 - temporalDiff / 6);
  const confidenceScore = Number((0.4 * geoScore + 0.4 * sim + 0.2 * tempScore).toFixed(3));

  let confidenceLabel: CorroborationEvidence["confidenceLabel"] = "LOW";
  if (confidenceScore >= 0.65) confidenceLabel = "HIGH";
  else if (confidenceScore >= 0.40) confidenceLabel = "MEDIUM";
  else if (claim1 || claim2) confidenceLabel = "UNVERIFIED";

  return {
    isMatch,
    geographicDistanceKm: distKm === Infinity ? null : distKm,
    geographicScore: Number(geoScore.toFixed(3)),
    temporalDiffHours: temporalDiff,
    temporalScore: Number(tempScore.toFixed(3)),
    semanticSimilarity: Number(sim.toFixed(3)),
    sharedTokens: sharedTokensList,
    targetConflict: hasTargetConflict,
    hardSplitReason: isMatch ? null : "SIMILARITY_BELOW_THRESHOLD",
    confidenceScore,
    confidenceLabel,
    algorithmVersion: CORROBORATION_ALGORITHM_VERSION
  };
}

/**
 * Multi-signal corroboration decision engine.
 */
export function shouldCorroborateEvents(
  ev1: { lat: number | null; lng: number | null; tokens: Set<string>; hoursAgo?: number },
  ev2: { lat: number | null; lng: number | null; tokens: Set<string>; hoursAgo?: number }
): boolean {
  return evaluatePairwiseCorroboration(ev1, ev2).isMatch;
}

/**
 * Clusters recent tactical events by geographic proximity, temporal window, and semantic overlap.
 * Uses conservative multi-signal clustering to avoid merging unrelated incidents.
 */
export function clusterRecentEvents(hours = 24): CorroboratedCluster[] {
  const cutoffIso = new Date(Date.now() - hours * 3_600_000).toISOString();

  const events = db
    .prepare(
      `SELECT id, type, title, description, severity, source, lat, lng, createdAt
       FROM events
       WHERE createdAt > ?
       ORDER BY createdAt DESC`
    )
    .all(cutoffIso) as RawEvent[];

  if (events.length === 0) return [];

  const clusters: RawEvent[][] = [];
  const eventTokenMap = new Map<number, Set<string>>();

  for (const ev of events) {
    eventTokenMap.set(ev.id, extractTokens(`${ev.title} ${ev.description ?? ""}`));
  }

  for (const ev of events) {
    let matchedCluster: RawEvent[] | null = null;
    const evTokens = eventTokenMap.get(ev.id)!;
    const evTime = new Date(ev.createdAt).getTime();

    for (const cluster of clusters) {
      const leader = cluster[0];
      const leaderTime = new Date(leader.createdAt).getTime();
      const timeDiffHours = Math.abs(evTime - leaderTime) / 3_600_000;

      // Conservative temporal window: events must be within 6 hours of each other
      if (timeDiffHours > 6.0) continue;

      const leaderTokens = eventTokenMap.get(leader.id)!;

      const decision = evaluatePairwiseCorroboration(
        { lat: ev.lat, lng: ev.lng, tokens: evTokens, hoursAgo: timeDiffHours },
        { lat: leader.lat, lng: leader.lng, tokens: leaderTokens, hoursAgo: 0 }
      );

      if (decision.isMatch) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.push(ev);
    } else {
      clusters.push([ev]);
    }
  }

  return clusters.map((group, idx) => {
    // Sort by severity descending, then createdAt ascending
    const sorted = [...group].sort((a, b) => {
      const sevDiff = Number(b.severity) - Number(a.severity);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const primary = sorted[0];
    const sourcesSet = new Set<string>();
    let hasSpeculative = false;

    const timestamps: number[] = [];

    for (const item of sorted) {
      if (item.source) sourcesSet.add(item.source);
      const fullText = `${item.title} ${item.description ?? ""}`;
      if (SPECULATIVE_PATTERNS.some((p) => p.test(fullText))) {
        hasSpeculative = true;
      }
      timestamps.push(new Date(item.createdAt).getTime());
    }

    const sources = Array.from(sourcesSet);
    const independence = resolveIndependentSourceCount(
      sorted.map((e) => ({ source: e.source, title: e.title, description: e.description }))
    );

    const independentSourceCount = independence.independentCount;

    let confidence: CorroboratedCluster["confidence"] = "LOW";
    let confidenceScore = 0.3;

    if (hasSpeculative && independentSourceCount < 2) {
      confidence = "UNVERIFIED";
      confidenceScore = 0.2;
    } else if (independentSourceCount >= 3) {
      confidence = "HIGH";
      confidenceScore = 0.85;
    } else if (independentSourceCount === 2 || sources.some((s) => VERIFIED_ORGANIZATIONS.includes(s))) {
      confidence = "MEDIUM";
      confidenceScore = 0.65;
    }

    const minTime = new Date(Math.min(...timestamps)).toISOString();
    const maxTime = new Date(Math.max(...timestamps)).toISOString();

    return {
      clusterId: `cluster-${primary.id}-${idx}`,
      primaryEvent: {
        id: primary.id,
        title: primary.title,
        type: primary.type,
        severity: primary.severity,
        source: primary.source,
        lat: primary.lat,
        lng: primary.lng,
        createdAt: primary.createdAt
      },
      eventIds: sorted.map((e) => e.id),
      sources,
      independentSourceCount,
      sourceClusters: independence.sourceClusters,
      confidence,
      confidenceScore,
      conflictingReports: hasSpeculative && independentSourceCount > 1,
      firstReportedAt: minTime,
      lastReportedAt: maxTime,
      summary: `${independentSourceCount} bağımsız kaynak kümesi tarafından doğrulandı (${confidence} Güvenirlik).`,
      algorithmVersion: CORROBORATION_ALGORITHM_VERSION
    };
  });
}
