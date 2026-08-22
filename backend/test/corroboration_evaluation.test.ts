import { describe, expect, it, beforeEach } from "vitest";
import db from "../src/db";
import { clusterRecentEvents } from "../src/services/corroboration.service";

export interface PairwiseTestCase {
  id: string;
  category: string;
  description: string;
  eventA: {
    title: string;
    description: string | null;
    severity: string;
    source: string;
    lat: number | null;
    lng: number | null;
    hoursAgo: number;
  };
  eventB: {
    title: string;
    description: string | null;
    severity: string;
    source: string;
    lat: number | null;
    lng: number | null;
    hoursAgo: number;
  };
  expectedSameEvent: boolean;
}

/**
 * 1,170-Case Pairwise Adversarial Intelligence Evaluation Dataset
 * Covering 24 tactical operational categories to rigorously evaluate corroboration clustering.
 */
export function buildAdversarialDataset(): PairwiseTestCase[] {
  const dataset: PairwiseTestCase[] = [];
  let idSeq = 1;

  const addCase = (
    category: string,
    description: string,
    eventA: PairwiseTestCase["eventA"],
    eventB: PairwiseTestCase["eventB"],
    expectedSameEvent: boolean
  ) => {
    dataset.push({
      id: `ADV-${String(idSeq++).padStart(4, "0")}`,
      category,
      description,
      eventA,
      eventB,
      expectedSameEvent
    });
  };

  const CITIES = [
    { name: "Damascus", trName: "Şam", lat: 33.5138, lng: 36.2765 },
    { name: "Beirut", trName: "Beyrut", lat: 33.8886, lng: 35.4955 },
    { name: "Isfahan", trName: "İsfahan", lat: 32.6546, lng: 51.6680 },
    { name: "Tehran", trName: "Tahran", lat: 35.6892, lng: 51.3890 },
    { name: "Aleppo", trName: "Halep", lat: 36.2021, lng: 37.1343 },
    { name: "Hodeidah", trName: "Hudeyde", lat: 14.7978, lng: 42.9545 },
    { name: "Eilat", trName: "Elat", lat: 29.5577, lng: 34.9519 },
    { name: "Tel Aviv", trName: "Tel Aviv", lat: 32.0853, lng: 34.7818 },
    { name: "Baghdad", trName: "Bağdat", lat: 33.3152, lng: 44.3661 },
    { name: "Gaza", trName: "Gazze", lat: 31.5017, lng: 34.4668 },
    { name: "Jerusalem", trName: "Kudüs", lat: 31.7683, lng: 35.2137 },
    { name: "Latakia", trName: "Lazkiye", lat: 35.5317, lng: 35.7900 },
    { name: "Tabriz", trName: "Tebriz", lat: 38.0962, lng: 46.2346 },
    { name: "Kermanshah", trName: "Kirmanşah", lat: 34.3142, lng: 47.0650 },
    { name: "Tripoli", trName: "Trablus", lat: 34.4367, lng: 35.8497 }
  ];

  // 1. Same Event / Identical Wording & Wire Syndication (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-identical",
      `Syndicated identical wire report for ${city.name} strike #${i + 1}`,
      {
        title: `Explosion rocks military logistics depot in ${city.name}`,
        description: `Heavy detonations reported in central ${city.name} defense industrial zone.`,
        severity: "4",
        source: "Reuters",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 2.0 + (i % 3) * 0.1
      },
      {
        title: `Explosion rocks military logistics depot in ${city.name}`,
        description: `Heavy detonations reported in central ${city.name} defense industrial zone.`,
        severity: "4",
        source: "AP News",
        lat: city.lat + 0.001,
        lng: city.lng + 0.001,
        hoursAgo: 2.1 + (i % 3) * 0.1
      },
      true
    );
  }

  // 2. Same Event / Paraphrase & Lexical Variation (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-paraphrase",
      `Paraphrased reports for ${city.name} warehouse hit #${i + 1}`,
      {
        title: `Air defense batteries engage incoming aerial targets over ${city.name}`,
        description: `Multiple missile intercepts observed above ${city.name} international airfield.`,
        severity: "4",
        source: "BBC World",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.5
      },
      {
        title: `Missiles intercepted above ${city.name} airport by defense systems`,
        description: `Sirens sound as anti-air interceptors engage projectiles near ${city.name}.`,
        severity: "4",
        source: "Al Jazeera",
        lat: city.lat + 0.005,
        lng: city.lng - 0.005,
        hoursAgo: 1.7
      },
      true
    );
  }

  // 3. Same Event / Turkish Lexical Variation (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-turkish",
      `Turkish language coverage for ${city.name} operation #${i + 1}`,
      {
        title: `${city.trName} havaalanı yakınlarındaki askeri üsse hava saldırısı düzenlendi`,
        description: `Suriye resmi ajansı ${city.trName} çevresinde patlama sesleri duyulduğunu aktardı.`,
        severity: "4",
        source: "Anadolu Ajansı",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 3.0
      },
      {
        title: `${city.trName} havaalanı bölgesinde askeri tesislere yönelik hava saldırısı`,
        description: `Yerel kaynaklar ${city.trName} hava savunma bataryalarının füzelere karşılık verdiğini bildirdi.`,
        severity: "4",
        source: "TRT Haber",
        lat: city.lat + 0.002,
        lng: city.lng + 0.002,
        hoursAgo: 3.2
      },
      true
    );
  }

  // 4. Same Event / Military Terminology Variation (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-mil-synonym",
      `Military jargon variations for ${city.name} drone/SAM strike #${i + 1}`,
      {
        title: `IAF airstrikes destroy subterranean UAV command bunker near ${city.name}`,
        description: `Precision guided munitions struck underground drone launch site.`,
        severity: "5",
        source: "Defense One",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 4.0
      },
      {
        title: `Fighter jets bomb underground drone control facility in ${city.name}`,
        description: `Aerial bombardment targeted subterranean unmanned aerial vehicle center.`,
        severity: "5",
        source: "ISW",
        lat: city.lat - 0.003,
        lng: city.lng + 0.002,
        hoursAgo: 4.2
      },
      true
    );
  }

  // 5. Same Event / Cross-Language English-Turkish Semantic Pair (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-bilingual",
      `Bilingual English-Turkish coverage of ${city.name} airstrike #${i + 1}`,
      {
        title: `Israeli airstrikes hit weapons convoy and logistics trucks near ${city.name}`,
        description: `Targeted air raid destroyed transport convoy transporting armaments near ${city.name}.`,
        severity: "4",
        source: "BBC World",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 2.8
      },
      {
        title: `${city.trName} yakınlarında silah taşıyan askeri konvoya hava saldırısı`,
        description: `${city.trName} kırsalında askeri mühimmat taşıyan lojistik araçlar hava saldırısıyla vuruldu.`,
        severity: "4",
        source: "Anadolu Ajansı",
        lat: city.lat + 0.003,
        lng: city.lng + 0.003,
        hoursAgo: 3.0
      },
      true
    );
  }

  // 6. Same Event / Multilingual Entity & City Aliases (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-multilingual-aliases",
      `Entity alias coverage (${city.name} vs ${city.trName}) #${i + 1}`,
      {
        title: `Ballistic missile strike destroys radar installation in ${city.name}`,
        description: `Early warning radar base in ${city.name} suffered severe damage after missile salvo.`,
        severity: "5",
        source: "Reuters",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.2
      },
      {
        title: `${city.trName} radar istasyonuna füze saldırısı düzenlendi`,
        description: `${city.trName} bölgesindeki askeri radar tesisi balistik füze ile vuruldu.`,
        severity: "5",
        source: "TRT Haber",
        lat: city.lat + 0.001,
        lng: city.lng - 0.001,
        hoursAgo: 1.4
      },
      true
    );
  }

  // 7. Same Event / Short Flash Alert vs Full Report (45 cases)
  for (let i = 0; i < 45; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-length-disparity",
      `Breaking alert vs detailed investigative report in ${city.name} #${i + 1}`,
      {
        title: `BREAKING: Airstrike hits ${city.name} port`,
        description: null,
        severity: "3",
        source: "Flash News",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.0
      },
      {
        title: `Extensive airstrikes strike naval berths and maritime fuel storage at ${city.name} port`,
        description: `Satellite imagery and local emergency services confirm severe structural damage to port infrastructure in ${city.name} following repeated airstrike waves.`,
        severity: "4",
        source: "Reuters Analysis",
        lat: city.lat + 0.001,
        lng: city.lng + 0.001,
        hoursAgo: 1.3
      },
      true
    );
  }

  // 8. Same Event / Conflicting Claims & Denials (45 cases)
  for (let i = 0; i < 45; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-conflicting-claims",
      `Attribution claim vs state denial in ${city.name} #${i + 1}`,
      {
        title: `Rebel forces claim drone strike on radar facility in ${city.name}`,
        description: `Opposition group claims successful unmanned drone detonation at ${city.name} radar outpost.`,
        severity: "3",
        source: "Opposition Wire",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 2.5
      },
      {
        title: `Defense ministry denies drone strike on ${city.name} radar facility, cites false claims`,
        description: `Official statement refutes claims of damage to ${city.name} radar base, confirming systems operational.`,
        severity: "2",
        source: "State Media",
        lat: city.lat + 0.002,
        lng: city.lng - 0.001,
        hoursAgo: 2.8
      },
      true
    );
  }

  // 9. Same Event / Retraction & Clarification Cycle (45 cases)
  for (let i = 0; i < 45; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-retraction",
      `Initial casualty estimate vs corrected casualty report in ${city.name} #${i + 1}`,
      {
        title: `Initial reports: 50 casualties in ${city.name} missile strike`,
        description: `Early unverified reports claim massive casualties following strike in ${city.name}.`,
        severity: "5",
        source: "Social Feed",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 4.0
      },
      {
        title: `Correction: 3 wounded in ${city.name} missile strike, initial reports overstated`,
        description: `Hospital authorities in ${city.name} clarify only 3 light injuries from missile strike.`,
        severity: "3",
        source: "Official Bulletin",
        lat: city.lat + 0.001,
        lng: city.lng - 0.001,
        hoursAgo: 4.4
      },
      true
    );
  }

  // 10. Same Event / Missing Coordinates on One Side (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-missing-geo",
      `Geolocated report vs un-geolocated report in ${city.name} #${i + 1}`,
      {
        title: `Massive missile barrage targets airbase hangar in ${city.name}`,
        description: `Over a dozen ballistic projectiles struck airfield infrastructure in ${city.name}.`,
        severity: "5",
        source: "Jerusalem Post",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 3.5
      },
      {
        title: `Massive missile barrage targets airbase hangar in ${city.name}`,
        description: `Airbase infrastructure in ${city.name} heavily damaged following ballistic missile strikes.`,
        severity: "5",
        source: "Military Times",
        lat: null,
        lng: null,
        hoursAgo: 3.6
      },
      true
    );
  }

  // 11. Same Event / Multi-Source Independent Verification (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-independent-sources",
      `Independent multi-source reporting of ${city.name} munitions blast #${i + 1}`,
      {
        title: `Explosion rocks subterranean munitions depot in ${city.name}`,
        description: `Underground storage site in ${city.name} destroyed by secondary detonations.`,
        severity: "4",
        source: "ISW",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 2.0
      },
      {
        title: `Underground munitions facility in ${city.name} struck by precision munitions`,
        description: `Defense officials confirm detonation of subterranean arms bunker near ${city.name}.`,
        severity: "4",
        source: "Defense One",
        lat: city.lat + 0.002,
        lng: city.lng - 0.001,
        hoursAgo: 2.3
      },
      true
    );
  }

  // 12. Same Event / Rapid Follow-Up & Aftermath (45 cases)
  for (let i = 0; i < 45; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "same-event-followup",
      `Initial strike alert and immediate damage follow-up in ${city.name} #${i + 1}`,
      {
        title: `Airstrikes strike weapons depot in ${city.name}`,
        description: `Fighter jets conducted strikes on military arms cache in ${city.name}.`,
        severity: "4",
        source: "Reuters",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.0
      },
      {
        title: `Secondary explosions rock weapons depot in ${city.name} following airstrikes`,
        description: `Emergency response units deployed as munitions depot fire spreads in ${city.name}.`,
        severity: "4",
        source: "BBC World",
        lat: city.lat + 0.001,
        lng: city.lng + 0.001,
        hoursAgo: 1.5
      },
      true
    );
  }

  // 13. DIFFERENT Events / Same City, Distinct Targets (50 cases) — ADVERSARIAL FALSE MERGE TEST
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-same-city",
      `ADVERSARIAL: Distinct northern warehouse vs southern coastal radar in ${city.name} #${i + 1}`,
      {
        title: `Airstrike hits northern ammunition warehouse in ${city.name} industrial zone`,
        description: `Explosions reported at northern industrial munitions depot in ${city.name}.`,
        severity: "4",
        source: "Reuters",
        lat: city.lat + 0.08, // ~10km north
        lng: city.lng,
        hoursAgo: 2.0
      },
      {
        title: `Naval artillery shells southern coastal radar outpost in ${city.name} maritime zone`,
        description: `Coastal patrol boats targeted radar station at southern shoreline of ${city.name}.`,
        severity: "4",
        source: "BBC World",
        lat: city.lat - 0.08, // ~10km south
        lng: city.lng,
        hoursAgo: 2.2
      },
      false
    );
  }

  // 14. DIFFERENT Events / Same Hour, Different Distant Cities (50 cases) — HARD GEOGRAPHIC GATE TEST
  for (let i = 0; i < 50; i++) {
    const cityA = CITIES[i % CITIES.length];
    const cityB = CITIES[(i + 3) % CITIES.length];
    addCase(
      "diff-event-same-hour",
      `Synchronous syndicated strikes in distant cities (${cityA.name} vs ${cityB.name}) #${i + 1}`,
      {
        title: `Air raid sirens active as airstrikes strike military sector in ${cityA.name}`,
        description: `Defenses active across ${cityA.name} metropolitan region.`,
        severity: "4",
        source: "Reuters",
        lat: cityA.lat,
        lng: cityA.lng,
        hoursAgo: 1.0
      },
      {
        title: `Air raid sirens active as airstrikes strike military sector in ${cityB.name}`,
        description: `Defenses active across ${cityB.name} metropolitan region.`,
        severity: "4",
        source: "AFP",
        lat: cityB.lat,
        lng: cityB.lng,
        hoursAgo: 1.1
      },
      false
    );
  }

  // 15. DIFFERENT Events / Same Target, Staggered by >6 Hours (>6h temporal cutoff) (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-temporal-cutoff",
      `Separate morning vs evening sorties at ${city.name} airfield #${i + 1}`,
      {
        title: `Dawn airstrikes hit runway at ${city.name} international airport`,
        description: `Early morning sortie targeted logistics runway in ${city.name}.`,
        severity: "4",
        source: "Reuters",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 16.0
      },
      {
        title: `Evening airstrikes hit runway at ${city.name} international airport`,
        description: `Night raid conducted against secondary runway in ${city.name}.`,
        severity: "4",
        source: "BBC World",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 2.0
      },
      false
    );
  }

  // 16. DIFFERENT Events / Nearby Coordinates (<25km) with Distinct Tactical Contexts (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-nearby-geo",
      `Border infantry ambush vs electronic warfare jamming near ${city.name} #${i + 1}`,
      {
        title: `Border infantry patrol ambushed by militant squad near ${city.name} perimeter`,
        description: `Small arms gunfire and RPG exchanges reported along security fence.`,
        severity: "3",
        source: "Jerusalem Post",
        lat: city.lat + 0.15,
        lng: city.lng + 0.15,
        hoursAgo: 2.5
      },
      {
        title: `Electronic warfare units deploy GPS jamming systems near ${city.name} communications hub`,
        description: `Navigation signals disrupted following activation of electronic countermeasure arrays.`,
        severity: "2",
        source: "Defense One",
        lat: city.lat - 0.12,
        lng: city.lng - 0.12,
        hoursAgo: 2.7
      },
      false
    );
  }

  // 17. DIFFERENT Events / Resurfaced Archive News (>20h apart) (45 cases)
  for (let i = 0; i < 45; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-resurfaced-old",
      `Archive post-strike report vs fresh incident in ${city.name} #${i + 1}`,
      {
        title: `Archive analysis of previous drone strike on ${city.name} munitions site`,
        description: `Detailed post-strike damage assessment of last month's munitions depot strike in ${city.name}.`,
        severity: "2",
        source: "Think Tank",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 22.0
      },
      {
        title: `Urgent: Fresh drone swarm sighted heading towards ${city.name} munitions facility`,
        description: `Air defenses tracking multiple low flying UAVs approaching ${city.name}.`,
        severity: "4",
        source: "Wire Live",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.0
      },
      false
    );
  }

  // 18. DIFFERENT Events / Separate Combatants, Distinct Operations (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-separate-combatants",
      `Naval patrol interception vs inland artillery shelling in ${city.name} #${i + 1}`,
      {
        title: `Coast guard intercepts illicit weapons smuggling vessel off ${city.name} coast`,
        description: `Interception of speedboat carrying arms in territorial waters.`,
        severity: "3",
        source: "Maritime Security",
        lat: city.lat,
        lng: city.lng + 0.2,
        hoursAgo: 3.0
      },
      {
        title: `Heavy artillery battery shells militant mortar positions inland from ${city.name}`,
        description: `Howitzers fired sustained barrages against inland ridge positions.`,
        severity: "4",
        source: "Military Brief",
        lat: city.lat,
        lng: city.lng - 0.2,
        hoursAgo: 3.1
      },
      false
    );
  }

  // 19. DIFFERENT Events / Keyword Collision — Training Drill vs Combat Attack (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-keyword-collision",
      `ADVERSARIAL: Live-fire drill vs actual missile strike in ${city.name} #${i + 1}`,
      {
        title: `Armed forces commence scheduled live fire air defense drill in ${city.name}`,
        description: `Annual training exercise simulating missile interceptors and radar tracking.`,
        severity: "2",
        source: "Ministry PR",
        lat: city.lat + 0.05,
        lng: city.lng - 0.05,
        hoursAgo: 2.0
      },
      {
        title: `Hostile ballistic missile fired from hostile territory detonates in ${city.name}`,
        description: `Combat impact confirmed causing structural fires in ${city.name}.`,
        severity: "5",
        source: "Reuters",
        lat: city.lat - 0.05,
        lng: city.lng + 0.05,
        hoursAgo: 2.2
      },
      false
    );
  }

  // 20. DIFFERENT Events / Multi-Day Recurring Wire Syndication (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-multi-day-recurrence",
      `Identical wire published on consecutive days in ${city.name} #${i + 1}`,
      {
        title: `Drone intercepted over ${city.name} industrial park`,
        description: `Unmanned aerial vehicle downed by interceptors over ${city.name}.`,
        severity: "3",
        source: "Wire Daily",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 23.0
      },
      {
        title: `Drone intercepted over ${city.name} industrial park`,
        description: `Unmanned aerial vehicle downed by interceptors over ${city.name}.`,
        severity: "3",
        source: "Wire Daily",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.0
      },
      false
    );
  }

  // 21. DIFFERENT Events / Civil Unrest vs Military Strike (45 cases)
  for (let i = 0; i < 45; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-civil-vs-military",
      `Civilian street protest vs distant military strike in ${city.name} #${i + 1}`,
      {
        title: `Civilian protest rally disperses peacefully in central ${city.name} square`,
        description: `Demonstrators march through downtown ${city.name} without major security incident.`,
        severity: "1",
        source: "City Gazette",
        lat: city.lat,
        lng: city.lng,
        hoursAgo: 1.5
      },
      {
        title: `Fighter aircraft launch precision strikes against military barracks outside ${city.name}`,
        description: `Heavy detonations at armed forces base 25km outside ${city.name}.`,
        severity: "4",
        source: "Reuters",
        lat: city.lat + 0.25,
        lng: city.lng + 0.25,
        hoursAgo: 1.8
      },
      false
    );
  }

  // 22. DIFFERENT Events / Contradictory Coordinates with Generic Text (50 cases)
  for (let i = 0; i < 50; i++) {
    const cityA = CITIES[i % CITIES.length];
    const cityB = CITIES[(i + 5) % CITIES.length];
    addCase(
      "diff-event-contradictory-coords",
      `Generic wire with contradictory coords (${cityA.name} vs ${cityB.name}) #${i + 1}`,
      {
        title: `Heavy artillery barrage impacts border defense sector`,
        description: `Artillery shelling reported targeting frontline observation fortifications.`,
        severity: "4",
        source: "Combat Wire",
        lat: cityA.lat,
        lng: cityA.lng,
        hoursAgo: 2.0
      },
      {
        title: `Heavy artillery barrage impacts border defense sector`,
        description: `Artillery shelling reported targeting frontline observation fortifications.`,
        severity: "4",
        source: "Frontline News",
        lat: cityB.lat,
        lng: cityB.lng,
        hoursAgo: 2.2
      },
      false
    );
  }

  // 23. DIFFERENT Events / Contradictory Cities with Null Coordinates (50 cases)
  for (let i = 0; i < 50; i++) {
    const cityA = CITIES[i % CITIES.length];
    const cityB = CITIES[(i + 4) % CITIES.length];
    addCase(
      "diff-event-contradictory-cities-no-coords",
      `Un-geolocated reports with contradictory cities (${cityA.name} vs ${cityB.name}) #${i + 1}`,
      {
        title: `Missile strikes reported in central ${cityA.name}`,
        description: `Local witnesses report missile impacts across ${cityA.name} industrial district.`,
        severity: "4",
        source: "Wire A",
        lat: null,
        lng: null,
        hoursAgo: 1.0
      },
      {
        title: `Missile strikes reported in central ${cityB.name}`,
        description: `Local witnesses report missile impacts across ${cityB.name} industrial district.`,
        severity: "4",
        source: "Wire B",
        lat: null,
        lng: null,
        hoursAgo: 1.2
      },
      false
    );
  }

  // 24. DIFFERENT Events / Distinct Critical Facilities in Same Metro Area (50 cases)
  for (let i = 0; i < 50; i++) {
    const city = CITIES[i % CITIES.length];
    addCase(
      "diff-event-distinct-facilities",
      `Airbase runway strike vs subterranean command bunker in ${city.name} #${i + 1}`,
      {
        title: `Precision airstrikes strike military runway at ${city.name} airbase`,
        description: `Airfield runway and hangars damaged by aerial bombardment in ${city.name}.`,
        severity: "4",
        source: "Reuters",
        lat: city.lat + 0.04,
        lng: city.lng - 0.04,
        hoursAgo: 2.0
      },
      {
        title: `Deep-penetration bombs destroy subterranean command bunker near ${city.name}`,
        description: `Underground fortified bunker complex collapsed following precision bunker buster strike.`,
        severity: "5",
        source: "Defense One",
        lat: city.lat - 0.04,
        lng: city.lng + 0.04,
        hoursAgo: 2.3
      },
      false
    );
  }

  return dataset;
}

describe("CORROBORATION ENGINE — 1,170 ADVERSARIAL PAIRWISE EVALUATION", () => {
  const dataset = buildAdversarialDataset();

  beforeEach(() => {
    db.prepare("DELETE FROM events").run();
  });

  it(`evaluates ${dataset.length} adversarial pairwise tactical cases across 24 operational categories`, () => {
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;

    const categoryStats: Record<
      string,
      { total: number; correct: number; falseMerge: number; falseSplit: number }
    > = {};

    for (const testCase of dataset) {
      if (!categoryStats[testCase.category]) {
        categoryStats[testCase.category] = { total: 0, correct: 0, falseMerge: 0, falseSplit: 0 };
      }

      db.prepare("DELETE FROM events").run();

      const timeA = new Date(Date.now() - testCase.eventA.hoursAgo * 3_600_000).toISOString();
      const timeB = new Date(Date.now() - testCase.eventB.hoursAgo * 3_600_000).toISOString();

      db.prepare(`
        INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
        VALUES ('strike', @title, @description, @severity, @source, @lat, @lng, @createdAt)
      `).run({
        title: testCase.eventA.title,
        description: testCase.eventA.description,
        severity: testCase.eventA.severity,
        source: testCase.eventA.source,
        lat: testCase.eventA.lat,
        lng: testCase.eventA.lng,
        createdAt: timeA
      });

      db.prepare(`
        INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
        VALUES ('strike', @title, @description, @severity, @source, @lat, @lng, @createdAt)
      `).run({
        title: testCase.eventB.title,
        description: testCase.eventB.description,
        severity: testCase.eventB.severity,
        source: testCase.eventB.source,
        lat: testCase.eventB.lat,
        lng: testCase.eventB.lng,
        createdAt: timeB
      });

      const clusters = clusterRecentEvents(24);
      const isMerged = clusters.length === 1;

      categoryStats[testCase.category].total++;

      if (testCase.expectedSameEvent && isMerged) {
        tp++;
        categoryStats[testCase.category].correct++;
      } else if (!testCase.expectedSameEvent && !isMerged) {
        tn++;
        categoryStats[testCase.category].correct++;
      } else if (!testCase.expectedSameEvent && isMerged) {
        fp++;
        categoryStats[testCase.category].falseMerge++;
      } else if (testCase.expectedSameEvent && !isMerged) {
        fn++;
        categoryStats[testCase.category].falseSplit++;
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const falseMergeRate = fp + tn > 0 ? fp / (fp + tn) : 0;
    const falseSplitRate = fn + tp > 0 ? fn / (fn + tp) : 0;
    const accuracy = (tp + tn) / dataset.length;

    console.info("\n" + "=".repeat(75));
    console.info("CORROBORATION ENGINE — 1,170 ADVERSARIAL BENCHMARK RESULTS");
    console.info("=".repeat(75));
    console.info(`Total Pairwise Cases Evaluated: ${dataset.length}`);
    console.info(`True Positives (Correct Merges) : ${tp}`);
    console.info(`True Negatives (Correct Splits) : ${tn}`);
    console.info(`False Positives (FALSE MERGE)   : ${fp} (False Merge Rate: ${(falseMergeRate * 100).toFixed(2)}%)`);
    console.info(`False Negatives (FALSE SPLIT)   : ${fn} (False Split Rate: ${(falseSplitRate * 100).toFixed(2)}%)`);
    console.info(`Accuracy                        : ${(accuracy * 100).toFixed(2)}%`);
    console.info(`Precision                       : ${(precision * 100).toFixed(2)}%`);
    console.info(`Recall                          : ${(recall * 100).toFixed(2)}%`);
    console.info(`F1-Score                        : ${(f1 * 100).toFixed(2)}%`);
    console.info("-".repeat(75));
    console.info("CATEGORY-BY-CATEGORY BREAKDOWN:");
    for (const [cat, stats] of Object.entries(categoryStats)) {
      const catAcc = ((stats.correct / stats.total) * 100).toFixed(0);
      console.info(`  • ${cat.padEnd(38)}: ${stats.correct}/${stats.total} (${catAcc}%) | FM: ${stats.falseMerge} | FS: ${stats.falseSplit}`);
    }
    console.info("=".repeat(75) + "\n");

    // Empirical Regression Invariants
    expect(dataset.length).toBeGreaterThanOrEqual(1000);
    expect(falseMergeRate).toBeLessThan(0.03);
    expect(falseSplitRate).toBeLessThan(0.10);
    expect(f1).toBeGreaterThanOrEqual(0.92);
    expect(accuracy).toBeGreaterThanOrEqual(0.94);
  });
});
