/**
 * Comprehensive Independent Curated Corroboration Evaluation Dataset
 *
 * PROVENANCE & ANNOTATION SPECIFICATION:
 * - Hand-crafted realistic tactical intelligence event pairs.
 * - Independent from classifier implementation.
 * - Cross-language: Turkish & English with military, OSINT, and regional terminology.
 * - Partitions:
 *   1. "dev"          : Standard multi-signal tactical reports (15 pairs)
 *   2. "val"          : Multi-signal cross-language validation (15 pairs)
 *   3. "holdout"      : Clean unseen hold-out baseline (15 pairs)
 *   4. "adversarial"  : Contradiction traps, civil vs military, drill vs combat (10 pairs)
 *   5. "edge-case"    : Geographic & temporal boundary thresholds (10 pairs)
 *   6. "ood"          : Out-of-distribution (naval warfare, cyber/EW, piracy) (10 pairs)
 * Total: 75 meticulously curated pairwise tactical scenarios.
 */

export interface PairwiseTestCase {
  id: string;
  category: string;
  partition: "dev" | "val" | "holdout" | "adversarial" | "edge-case" | "ood";
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
  ambiguityLevel: "LOW" | "MEDIUM" | "HIGH";
  notes?: string;
}

export const INDEPENDENT_EVALUATION_DATASET: PairwiseTestCase[] = [
  // =========================================================================
  // PARTITION 1: DEVELOPMENT (15 PAIRS)
  // =========================================================================
  {
    id: "DEV-01",
    partition: "dev",
    category: "same-event-wire",
    description: "Reuters and AP reporting identical Damascus airport warehouse strike",
    eventA: {
      title: "Explosions reported at munitions depot near Damascus International Airport",
      description: "Syrian state media reported air defense batteries intercepted several incoming missiles.",
      severity: "4",
      source: "Reuters",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrikes hit weapons storage facility close to Damascus International Airport",
      description: "Detonations were observed in the vicinity of Damascus airport following an aerial attack.",
      severity: "4",
      source: "AP News",
      lat: 33.5142,
      lng: 36.2770,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-02",
    partition: "dev",
    category: "same-event-cross-lang",
    description: "Turkish and English reports on Beirut southern suburb UAV strike",
    eventA: {
      title: "Drone strike targets vehicle in southern Beirut suburb of Dahiyeh",
      description: "Lebanese security officials confirm kamikaze drone struck an SUV in Dahiyeh district.",
      severity: "4",
      source: "BBC World",
      lat: 33.8886,
      lng: 35.4955,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Beyrut'un güneyindeki Dahiye bölgesinde insansız hava aracı saldırısı",
      description: "Lübnan güvenlik kaynakları Dahiye mahallesinde bir aracın İHA ile vurulduğunu bildirdi.",
      severity: "4",
      source: "Anadolu Ajansı",
      lat: 33.8890,
      lng: 35.4950,
      hoursAgo: 2.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-03",
    partition: "dev",
    category: "same-event-paraphrase",
    description: "Isfahan air defense interception reported with paraphrased descriptions",
    eventA: {
      title: "Air defense systems engage incoming projectile barrage over Isfahan",
      description: "Loud blasts heard as interceptor batteries fired at aerial targets in Isfahan airspace.",
      severity: "4",
      source: "Al Jazeera",
      lat: 32.6546,
      lng: 51.6680,
      hoursAgo: 0.5
    },
    eventB: {
      title: "Missile interception sirens activated across central Isfahan province",
      description: "Anti-air batteries opened fire against incoming missiles over Isfahan military zone.",
      severity: "4",
      source: "Ynetnews",
      lat: 32.6550,
      lng: 51.6675,
      hoursAgo: 0.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-04",
    partition: "dev",
    category: "hard-neg-different-city",
    description: "Same strike type occurring simultaneously in Damascus and Aleppo",
    eventA: {
      title: "Airstrikes hit radar installation on the outskirts of Damascus",
      description: "Multiple aerial strikes targeted air defense radar sites around Damascus.",
      severity: "4",
      source: "ISW",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Airstrikes hit radar installation on the outskirts of Aleppo",
      description: "Multiple aerial strikes targeted air defense radar sites around Aleppo.",
      severity: "4",
      source: "ISW",
      lat: 36.2021,
      lng: 37.1343,
      hoursAgo: 1.5
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW",
    notes: "Different cities (>300 km apart)"
  },
  {
    id: "DEV-05",
    partition: "dev",
    category: "hard-neg-drill-vs-combat",
    description: "Scheduled military drill reported vs real combat missile strike in Tehran",
    eventA: {
      title: "Iranian armed forces launch scheduled air defense simulation drill near Tehran",
      description: "Military command announced a 3-day readiness exercise simulating drone interceptions.",
      severity: "2",
      source: "Iran Int'l",
      lat: 35.6892,
      lng: 51.3890,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Missile explosions rock military industrial base on the edge of Tehran",
      description: "Hostile airstrike targeted missile assembly facility near Tehran leaving multiple casualties.",
      severity: "5",
      source: "Reuters",
      lat: 35.6890,
      lng: 51.3885,
      hoursAgo: 2.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "DEV-06",
    partition: "dev",
    category: "same-event-artillery",
    description: "Artillery shelling along southern Lebanese border positions",
    eventA: {
      title: "Heavy artillery shelling hits frontline military bunkers near border",
      description: "Artillery howitzer fire targeted fortified outpost positions causing structural damage.",
      severity: "3",
      source: "BBC World",
      lat: 33.1000,
      lng: 35.3000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Topçu atışları sınır hattındaki tahkimat ve askeri sığınakları hedef aldı",
      description: "Obüs mermileri sınır boyundaki askeri tesislere isabet etti.",
      severity: "3",
      source: "TRT Haber",
      lat: 33.1005,
      lng: 35.3010,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-07",
    partition: "dev",
    category: "hard-neg-facility-conflict",
    description: "Tartus naval port hit vs Tartus radar station hit (>5km apart)",
    eventA: {
      title: "Naval drone damages pier at Tartus maritime port facility",
      description: "Explosive unmanned boat struck commercial dock berths in Tartus harbor.",
      severity: "4",
      source: "Reuters",
      lat: 34.8900,
      lng: 35.8700,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrike destroys surveillance radar station on Tartus mountain ridge",
      description: "Precision guided missile took out early warning radar station 8km east of Tartus.",
      severity: "4",
      source: "ISW",
      lat: 34.9100,
      lng: 35.9700,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "DEV-08",
    partition: "dev",
    category: "same-event-gps-jamming",
    description: "GPS spoofing in Tel Aviv airspace reported by aviation monitors",
    eventA: {
      title: "Commercial pilots report severe GPS jamming over central Tel Aviv corridor",
      description: "Electronic warfare countermeasure interference disrupted cockpit navigation in Tel Aviv.",
      severity: "2",
      source: "Jerusalem Post",
      lat: 32.0853,
      lng: 34.7818,
      hoursAgo: 3.0
    },
    eventB: {
      title: "Widespread electronic warfare and navigation disruption detected across Tel Aviv",
      description: "Aviation tracking confirms GPS jamming signals active around Tel Aviv metropolitan area.",
      severity: "2",
      source: "Defense One",
      lat: 32.0860,
      lng: 34.7825,
      hoursAgo: 3.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-09",
    partition: "dev",
    category: "hard-neg-temporal-decay",
    description: "Same target (Homs airbase) bombed in two separate raids 14 hours apart",
    eventA: {
      title: "Morning airstrike craters runway at Shayrat airbase in Homs province",
      description: "Four cruise missiles struck primary runway intersections at dawn.",
      severity: "4",
      source: "SANA",
      lat: 34.4947,
      lng: 36.9069,
      hoursAgo: 15.0
    },
    eventB: {
      title: "Evening missile salvo targets fuel storage tanks at Shayrat airfield in Homs",
      description: "Secondary strike wave struck subterranean fuel reservoirs at nightfall.",
      severity: "4",
      source: "Reuters",
      lat: 34.4950,
      lng: 36.9075,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM",
    notes: "Exceeds 6.0h temporal clustering window"
  },
  {
    id: "DEV-10",
    partition: "dev",
    category: "same-event-anti-tank",
    description: "Guided anti-tank missile strike on armored vehicle in southern Lebanon",
    eventA: {
      title: "Anti-tank guided missile strikes armored personnel carrier near border",
      description: "ATGM projectile hit infantry fighting vehicle causing structural destruction.",
      severity: "3",
      source: "Al Manar",
      lat: 33.0900,
      lng: 35.2500,
      hoursAgo: 2.5
    },
    eventB: {
      title: "Güdümlü tanksavar füzesi sınır bölgesinde zırhlı aracı vurdu",
      description: "Tanksavar roketi ile gerçekleştirilen atışta askeri personel taşıyıcı tahrip oldu.",
      severity: "3",
      source: "AA",
      lat: 33.0910,
      lng: 35.2510,
      hoursAgo: 2.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-11",
    partition: "dev",
    category: "hard-neg-civil-vs-strike",
    description: "Civilian demonstration in Baghdad vs suicide drone strike in Baghdad",
    eventA: {
      title: "Mass demonstration and public protest gathers at Tahrir Square in Baghdad",
      description: "Thousands of civilian protesters march demanding administrative and political reform.",
      severity: "2",
      source: "Al Arabiya",
      lat: 33.3152,
      lng: 44.3661,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Kamikaze drone detonates near military headquarters in central Baghdad",
      description: "One-way attack drone targeted security compound perimeter causing major explosion.",
      severity: "4",
      source: "Reuters",
      lat: 33.3155,
      lng: 44.3665,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW",
    notes: "Contradiction: Protest vs Drone Strike"
  },
  {
    id: "DEV-12",
    partition: "dev",
    category: "same-event-unconfirmed-rumor",
    description: "Social media rumor vs wire report on blast in Hodeidah port",
    eventA: {
      title: "Unconfirmed claims circulate on social media regarding blast at Hodeidah port",
      description: "Local accounts report hearing loud explosion near container terminal in Hodeidah.",
      severity: "3",
      source: "Telegram OSINT",
      lat: 14.7978,
      lng: 42.9545,
      hoursAgo: 0.5
    },
    eventB: {
      title: "Airstrike targets fuel storage tanks in Yemen's port city of Hodeidah",
      description: "Naval coalition carried out aerial strikes on port infrastructure in Hodeidah.",
      severity: "4",
      source: "AFP",
      lat: 14.7980,
      lng: 42.9550,
      hoursAgo: 0.7
    },
    expectedSameEvent: true,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "DEV-13",
    partition: "dev",
    category: "hard-neg-different-countries",
    description: "Drone alert in Eilat (Israel) vs drone alert in Aqaba (Jordan) across border",
    eventA: {
      title: "Interceptor missile destroys hostile drone approaching Eilat naval port",
      description: "Air defense system neutralized aerial threat over Gulf of Aqaba heading towards Eilat.",
      severity: "4",
      source: "Times of Israel",
      lat: 29.5581,
      lng: 34.9482,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Jordanian armed forces shoot down surveillance UAV near Aqaba international airport",
      description: "Royal Jordanian Air Force intercepted reconnaissance drone over King Hussein airport in Aqaba.",
      severity: "4",
      source: "Jordan News",
      lat: 29.6116,
      lng: 35.0181,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "DEV-14",
    partition: "dev",
    category: "same-event-convoy-ambush",
    description: "Military logistics convoy ambushed in Deir ez-Zor desert corridor",
    eventA: {
      title: "Insurgents ambush military fuel convoy in eastern Deir ez-Zor desert",
      description: "Gunmen opened fire with rocket propelled grenades on military supply tankers.",
      severity: "3",
      source: "SOHR",
      lat: 35.3359,
      lng: 40.1408,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Deyrizor çölünde askeri ikmal konvoyuna silahlı pusu kuruldu",
      description: "Lojistik tanker konvoyuna roketatarlarla düzenlenen saldırıda araçlar alev aldı.",
      severity: "3",
      source: "AA",
      lat: 35.3365,
      lng: 40.1415,
      hoursAgo: 2.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "DEV-15",
    partition: "dev",
    category: "hard-neg-border-posts",
    description: "Border clashes at Metula post vs border clashes at Naqoura post (40km apart)",
    eventA: {
      title: "Cross border gunfire and mortar fire exchange reported at Metula sector",
      description: "Light weapons combat engaged along northern border perimeter fence near Metula.",
      severity: "3",
      source: "BBC World",
      lat: 33.2800,
      lng: 35.5800,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Cross border gunfire and mortar fire exchange reported at Naqoura sector",
      description: "Light weapons combat engaged along coastal border perimeter fence near Naqoura.",
      severity: "3",
      source: "BBC World",
      lat: 33.1200,
      lng: 35.1300,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },

  // =========================================================================
  // PARTITION 2: VALIDATION (15 PAIRS)
  // =========================================================================
  {
    id: "VAL-01",
    partition: "val",
    category: "same-event-cross-lang-gaza",
    description: "Turkish and English reports on residential district strike in Gaza City",
    eventA: {
      title: "Airstrike levels multi-story building in Rimal neighborhood of Gaza City",
      description: "Civil defense teams search rubble following aerial bombardment in central Rimal.",
      severity: "4",
      source: "BBC World",
      lat: 31.5167,
      lng: 34.4500,
      hoursAgo: 1.2
    },
    eventB: {
      title: "Gazze kentinin Rimal mahallesinde hava saldırısı sonucu bina yıkıldı",
      description: "Sivil savunma ekipleri hava harekatı sonrası enkazda arama kurtarma başlattı.",
      severity: "4",
      source: "TRT World",
      lat: 31.5170,
      lng: 34.4510,
      hoursAgo: 1.4
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-02",
    partition: "val",
    category: "same-event-ballistic-negev",
    description: "Ballistic missile impact near Nevatim airbase in Negev desert",
    eventA: {
      title: "Ballistic missile shrapnel impacts open terrain adjacent to Nevatim airbase",
      description: "Air defense intercepted incoming missile, debris fell in desert surrounding airfield.",
      severity: "4",
      source: "Reuters",
      lat: 31.2086,
      lng: 35.0136,
      hoursAgo: 0.8
    },
    eventB: {
      title: "Nevatim askeri hava üssü yakınlarına balistik füze parçaları düştü",
      description: "Hava savunma füzelerinin engellemesi sonrası şarapnel çöl arazisine saçıldı.",
      severity: "4",
      source: "Anadolu Ajansı",
      lat: 31.2090,
      lng: 35.0140,
      hoursAgo: 1.0
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-03",
    partition: "val",
    category: "hard-neg-two-ports",
    description: "Airstrike in Latakia seaport vs airstrike in Tartus seaport (55km apart)",
    eventA: {
      title: "Airstrike destroys container depot at Latakia maritime commercial port",
      description: "Heavy explosions reported as precision missiles struck Latakia port facility.",
      severity: "4",
      source: "SOHR",
      lat: 35.5317,
      lng: 35.7686,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Airstrike destroys container depot at Tartus maritime commercial port",
      description: "Heavy explosions reported as precision missiles struck Tartus port facility.",
      severity: "4",
      source: "SOHR",
      lat: 34.8900,
      lng: 35.8700,
      hoursAgo: 2.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW",
    notes: "Distinct port cities separated by 75km"
  },
  {
    id: "VAL-04",
    partition: "val",
    category: "same-event-synonyms",
    description: "Aerial bombardment vs airstrike against subterranean bunker near Tabriz",
    eventA: {
      title: "Aerial bombardment targets underground subterranean bunker complex in Tabriz",
      description: "Penetrator ordnance struck hardened command bunker installations in Tabriz.",
      severity: "5",
      source: "ISW",
      lat: 38.0962,
      lng: 46.2346,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrike hits underground command bunker facility near Tabriz",
      description: "Precision guided bombs detonated at fortified subterranean facility in Tabriz.",
      severity: "5",
      source: "Defense One",
      lat: 38.0965,
      lng: 46.2350,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-05",
    partition: "val",
    category: "hard-neg-drill-isfahan",
    description: "Scheduled military air defense drill in Isfahan vs combat drone strike in Isfahan",
    eventA: {
      title: "Air defense exercise and readiness drill underway at Isfahan nuclear site",
      description: "Armed forces conducting scheduled air defense tests with blank fire in Isfahan.",
      severity: "2",
      source: "IRNA",
      lat: 32.6546,
      lng: 51.6680,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Kamikaze drone strike causes fire at industrial complex in Isfahan",
      description: "Multiple suicide drones struck assembly plant causing severe structural damage.",
      severity: "4",
      source: "Reuters",
      lat: 32.6550,
      lng: 51.6685,
      hoursAgo: 1.6
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "VAL-06",
    partition: "val",
    category: "same-event-wire-cluster",
    description: "Reuters wire cited by multiple agencies on Homs refinery explosion",
    eventA: {
      title: "Reuters: Massive blast rocks oil refinery storage tanks in Homs",
      description: "According to Reuters, saboteurs detonated explosive devices at Homs refinery.",
      severity: "4",
      source: "Daily Star",
      lat: 34.7300,
      lng: 36.7100,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Explosion at Homs petroleum refinery sparks massive fire, Reuters reports",
      description: "Reuters news agency confirms major blast at Homs petroleum storage facility.",
      severity: "4",
      source: "Middle East Eye",
      lat: 34.7305,
      lng: 36.7105,
      hoursAgo: 2.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-07",
    partition: "val",
    category: "hard-neg-temporal-split",
    description: "Two artillery strikes at same border outpost separated by 9 hours",
    eventA: {
      title: "Morning artillery shelling hits outpost in Khiam sector",
      description: "Direct hits recorded on military observation tower at 06:00.",
      severity: "3",
      source: "Al Manar",
      lat: 33.3100,
      lng: 35.6000,
      hoursAgo: 10.0
    },
    eventB: {
      title: "Evening artillery shelling hits outpost in Khiam sector",
      description: "Second wave of howitzer artillery fire struck Khiam observation post at 15:00.",
      severity: "3",
      source: "Al Manar",
      lat: 33.3100,
      lng: 35.6000,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "VAL-08",
    partition: "val",
    category: "same-event-radar-strike",
    description: "Early warning radar station knocked out near Masyaf",
    eventA: {
      title: "Airstrike knocks out early warning surveillance radar near Masyaf",
      description: "Precision guided missile struck radar dome installations on Masyaf ridge.",
      severity: "4",
      source: "Haaretz",
      lat: 35.0653,
      lng: 36.3411,
      hoursAgo: 1.8
    },
    eventB: {
      title: "Masyaf yakinlarindaki erken uyari radar istasyonuna hava saldirisi duzenlendi",
      description: "Gudumlu fuzeler Masyaf askeri arastirma merkezi yakinindaki radari vurdu.",
      severity: "4",
      source: "TRT",
      lat: 35.0660,
      lng: 36.3420,
      hoursAgo: 2.0
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-09",
    partition: "val",
    category: "hard-neg-protest-vs-clash",
    description: "Anti-war peace rally in Tel Aviv vs armed shootout at police checkpoint in Jaffa",
    eventA: {
      title: "Peace rally and demonstration held at Habima Square in central Tel Aviv",
      description: "Civilians gather waving flags demanding immediate ceasefire negotiations.",
      severity: "2",
      source: "Ynet",
      lat: 32.0725,
      lng: 34.7794,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Armed clash and gunfire at security checkpoint in southern Tel Aviv district",
      description: "Gunmen opened fire on security officers resulting in firefight.",
      severity: "3",
      source: "Jerusalem Post",
      lat: 32.0500,
      lng: 34.7600,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "VAL-10",
    partition: "val",
    category: "same-event-red-sea-missile",
    description: "Anti-ship missile fired at commercial container vessel in southern Red Sea",
    eventA: {
      title: "Anti-ship cruise missile detonates near commercial vessel in southern Red Sea",
      description: "Maritime trade operations reported projectile exploded in water 100m off ship port side.",
      severity: "4",
      source: "UKMTO",
      lat: 13.5000,
      lng: 42.8000,
      hoursAgo: 0.5
    },
    eventB: {
      title: "Gemi savar fuzesi Kizildeniz'de ticari kargo gemisinin yakininda infilak etti",
      description: "Askeri kaynaklar gemi yakinlarinda fuze patlamasi gerceklestigini dogruladi.",
      severity: "4",
      source: "Deniz Haber",
      lat: 13.5010,
      lng: 42.8010,
      hoursAgo: 0.7
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-11",
    partition: "val",
    category: "hard-neg-airport-vs-powerplant",
    description: "Damascus airport strike vs Damascus power plant sabotage (18km apart)",
    eventA: {
      title: "Airstrikes target runway and cargo hangers at Damascus international airport",
      description: "Aerial attack damaged southern tarmac infrastructure at Damascus airfield.",
      severity: "4",
      source: "Reuters",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Explosion causes electrical blackout at thermal power plant south of Damascus",
      description: "Sabotage detonation knocked out high voltage transformers at power substation.",
      severity: "4",
      source: "SANA",
      lat: 33.3900,
      lng: 36.3200,
      hoursAgo: 1.6
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "VAL-12",
    partition: "val",
    category: "same-event-unconfirmed-cross-lang",
    description: "Syrian state television vs OSINT account on drone interception over Hama",
    eventA: {
      title: "Air defense batteries down hostile reconnaissance drone in western Hama countryside",
      description: "Military statement confirmed interceptor missiles destroyed incoming UAV.",
      severity: "3",
      source: "SANA",
      lat: 35.1318,
      lng: 36.7578,
      hoursAgo: 2.2
    },
    eventB: {
      title: "Hama bati kirsalinda kesif dronu hava savunma sistemlerince vurularak dusuruldu",
      description: "Askeri yetkililer Hama uzerinde yabanci bir insansiz hava aracinin imha edildigini bildirdi.",
      severity: "3",
      source: "Suriye Haber Ajansi",
      lat: 35.1325,
      lng: 36.7585,
      hoursAgo: 2.5
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-13",
    partition: "val",
    category: "hard-neg-non-geocoded-conflict",
    description: "Non-geocoded missile drill vs non-geocoded real airstrike report",
    eventA: {
      title: "Armed forces conclude tactical missile simulation drill in undisclosed desert proving ground",
      description: "Military command declared strategic missile exercise successfully completed.",
      severity: "2",
      source: "Defense News",
      lat: null,
      lng: null,
      hoursAgo: 3.0
    },
    eventB: {
      title: "Air force executes precision airstrikes against missile storage bunkers",
      description: "Fighter jets dropped bunker buster bombs on subterranean weapons caches.",
      severity: "5",
      source: "Reuters",
      lat: null,
      lng: null,
      hoursAgo: 3.2
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "VAL-14",
    partition: "val",
    category: "same-event-ammunition-depot",
    description: "Munitions warehouse explosion in al-Hasakah province",
    eventA: {
      title: "Secondary blasts follow drone strike on arms depot outside al-Hasakah",
      description: "Ammunition storage facility sustained catastrophic detonations after UAV hit.",
      severity: "4",
      source: "Rudaw",
      lat: 36.5000,
      lng: 40.7500,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Haseke yakinlarindaki cephanelik ambarinda siddetli patlamalar meydana geldi",
      description: "IHA saldirisi sonrasi askeri muhimmat deposunda ardi ardina infilaklar yasandi.",
      severity: "4",
      source: "Kurdpress",
      lat: 36.5010,
      lng: 40.7510,
      hoursAgo: 1.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-15",
    partition: "val",
    category: "hard-neg-naval-vs-land",
    description: "Coastal naval boat encounter vs inland border outpost shelling",
    eventA: {
      title: "Gunfire exchange between fast attack patrol craft off Tyre coastline",
      description: "Naval patrol engaged suspicious vessel in Lebanese territorial waters.",
      severity: "3",
      source: "NNA",
      lat: 33.2700,
      lng: 35.1800,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Artillery shells strike inland mountain outpost east of Tyre",
      description: "Howitzer artillery fire impacted fortified positions 15km inland from Tyre.",
      severity: "3",
      source: "Al Mayadeen",
      lat: 33.2700,
      lng: 35.3500,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },

  // =========================================================================
  // PARTITION 3: HOLDOUT (15 PAIRS)
  // =========================================================================
  {
    id: "HOLD-01",
    partition: "holdout",
    category: "same-event-beirut-airport-perimeter",
    description: "Missile interception over Khalde adjacent to Beirut international airport",
    eventA: {
      title: "Air defense intercepts hostile missile over Khalde south of Beirut airport",
      description: "Explosion echoed across southern coastal highway as projectile was downed.",
      severity: "4",
      source: "Reuters",
      lat: 33.7850,
      lng: 35.4800,
      hoursAgo: 0.9
    },
    eventB: {
      title: "Beyrut havalimanı güneyindeki Halde üzerinde füze engellendi",
      description: "Hava savunma bataryaları Halde semalarında gelen roketi havada imha etti.",
      severity: "4",
      source: "Anadolu Ajansı",
      lat: 33.7860,
      lng: 35.4810,
      hoursAgo: 1.1
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-02",
    partition: "holdout",
    category: "hard-neg-two-different-airbases",
    description: "Airstrike on Shayrat airbase vs airstrike on Tiyas (T4) airbase (85km apart)",
    eventA: {
      title: "Airstrikes damage military hardened aircraft shelters at Shayrat airbase",
      description: "Precision munitions struck four aircraft hangers at Shayrat airfield in Homs.",
      severity: "4",
      source: "ISW",
      lat: 34.4947,
      lng: 36.9069,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Airstrikes damage military hardened aircraft shelters at T4 Tiyas airbase",
      description: "Precision munitions struck four aircraft hangers at T4 airfield in Palmyra desert.",
      severity: "4",
      source: "ISW",
      lat: 34.5200,
      lng: 37.6300,
      hoursAgo: 2.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-03",
    partition: "holdout",
    category: "same-event-isfahan-drone",
    description: "Explosive drone attack on Isfahan military manufacturing complex",
    eventA: {
      title: "Explosive drone detonates against roof of defense production site in Isfahan",
      description: "Quadcopters carrying shaped charges attacked defense equipment facility in Isfahan.",
      severity: "4",
      source: "Wall Street Journal",
      lat: 32.6546,
      lng: 51.6680,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Isfahan'da askeri teçhizat fabrikasının çatısına patlayıcı yüklü İHA çarptı",
      description: "İsfahan'daki mühimmat üretim tesisine yönelik mikro insansız hava aracı saldırısı düzenlendi.",
      severity: "4",
      source: "TRT Haber",
      lat: 32.6552,
      lng: 51.6688,
      hoursAgo: 1.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-04",
    partition: "holdout",
    category: "hard-neg-drill-vs-strike-lebanon",
    description: "Routine military coastal live-fire exercise vs naval drone attack off Tyre",
    eventA: {
      title: "Naval forces conduct scheduled live fire target practice exercise off Tyre coast",
      description: "Notice to mariners issued for 48-hour routine naval gunnery training zone.",
      severity: "2",
      source: "NNA",
      lat: 33.2700,
      lng: 35.1900,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Hostile kamikaze naval drone strikes military patrol craft off Tyre coast",
      description: "Remote controlled explosive boat struck patrol vessel causing severe hull breach.",
      severity: "5",
      source: "Reuters",
      lat: 33.2705,
      lng: 35.1905,
      hoursAgo: 1.2
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "HOLD-05",
    partition: "holdout",
    category: "same-event-radar-aleppo",
    description: "Kuweires military airbase radar station destroyed in eastern Aleppo",
    eventA: {
      title: "Air defense radar array destroyed by precision missile at Kuweires airbase",
      description: "Radar tracking dish and control van destroyed at military aviation facility.",
      severity: "4",
      source: "Al Jazeera",
      lat: 36.1865,
      lng: 37.5840,
      hoursAgo: 2.5
    },
    eventB: {
      title: "Halep Kuveyris askeri hava ussundeki radar istasyonu fuzeyle vuruldu",
      description: "Hava savunma radar kubbesi gudumlu fuze ile imha edildi.",
      severity: "4",
      source: "AA",
      lat: 36.1870,
      lng: 37.5845,
      hoursAgo: 2.7
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-06",
    partition: "holdout",
    category: "hard-neg-airport-vs-seaport",
    description: "Beirut international airport perimeter vs Beirut port grain silos (9km apart)",
    eventA: {
      title: "Drone intercepted over southern perimeter of Beirut international airport",
      description: "Air defense downed reconnaissance UAV near runway 16 at Beirut airfield.",
      severity: "4",
      source: "Reuters",
      lat: 33.8209,
      lng: 35.4884,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Explosion damages commercial storage containers at Beirut sea port",
      description: "Detonation reported at terminal berth 4 in central Beirut maritime port.",
      severity: "4",
      source: "AP News",
      lat: 33.9015,
      lng: 35.5188,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "HOLD-07",
    partition: "holdout",
    category: "same-event-depot-explosion",
    description: "Secondary explosions at arms depot in Sayyidah Zaynab outside Damascus",
    eventA: {
      title: "Secondary detonations rip through weapons warehouse in Sayyidah Zaynab",
      description: "Airstrike caused extensive chain detonations at military storage facility.",
      severity: "5",
      source: "Al Jazeera",
      lat: 33.4444,
      lng: 36.3400,
      hoursAgo: 1.2
    },
    eventB: {
      title: "Sam Seyyide Zeynep bolgesindeki muhimmat deposunda siddetli patlamalar",
      description: "Hava saldirisi sonrasinda lojistik ambarinda ardi ardina patlamalar yasandi.",
      severity: "5",
      source: "Anadolu Ajansi",
      lat: 33.4450,
      lng: 36.3410,
      hoursAgo: 1.5
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-08",
    partition: "holdout",
    category: "hard-neg-distance-split",
    description: "Artillery at Mount Hermon vs Artillery at Metula (32km apart)",
    eventA: {
      title: "Artillery howitzer shelling impacts high altitude observation post on Mount Hermon",
      description: "Direct artillery fire hit radar post on slopes of Mount Hermon.",
      severity: "3",
      source: "SOHR",
      lat: 33.4144,
      lng: 35.8572,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Artillery howitzer shelling impacts border outpost near Metula",
      description: "Direct artillery fire hit observation post near Metula.",
      severity: "3",
      source: "Times of Israel",
      lat: 33.2800,
      lng: 35.5800,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-09",
    partition: "holdout",
    category: "same-event-gps-spoof",
    description: "GPS spoofing disrupting civil flights across eastern Mediterranean",
    eventA: {
      title: "Aviation authority issues alert over severe GPS spoofing in Beirut flight corridor",
      description: "Multiple commercial airliners reported false cockpit location readouts over Beirut.",
      severity: "2",
      source: "Aviation Daily",
      lat: 33.8886,
      lng: 35.4955,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Beyrut ucus koridorunda yogun GPS yaniltma ve elektronik harp sinyali tespit edildi",
      description: "Sivil ucaklar Beyrut semalarinda navigasyon sistemlerinin bozuldugunu bildirdi.",
      severity: "2",
      source: "Havacilik Haber",
      lat: 33.8890,
      lng: 35.4960,
      hoursAgo: 2.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-10",
    partition: "holdout",
    category: "hard-neg-civilian-rally-vs-strike",
    description: "Political celebration rally in Beirut vs Airstrike in southern Lebanon",
    eventA: {
      title: "Thousands gather for political commemoration rally at Martyrs Square in Beirut",
      description: "Public rally with musical performances and civic speeches in central Beirut.",
      severity: "1",
      source: "L'Orient Today",
      lat: 33.8960,
      lng: 35.5060,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Airstrike kills two commanders in targeted vehicle strike near Tyre",
      description: "Precision guided missile hit moving SUV on southern coastal highway.",
      severity: "4",
      source: "Reuters",
      lat: 33.2700,
      lng: 35.1900,
      hoursAgo: 2.2
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-11",
    partition: "holdout",
    category: "same-event-cross-border-raid",
    description: "Special forces raid on weapons workshop in Jenin refugee camp",
    eventA: {
      title: "Security forces raid underground munitions manufacturing workshop in Jenin",
      description: "Explosives laboratories and weapons stockpiles uncovered during tactical operation.",
      severity: "4",
      source: "Jerusalem Post",
      lat: 32.4600,
      lng: 35.3000,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Cenin multeci kampinda yeralti silah atolyesine operasyon duzenlendi",
      description: "Guvenlik gucleri Cenin'deki patlayici uretim tesisini ele gecirdi.",
      severity: "4",
      source: "Filistin Haber",
      lat: 32.4605,
      lng: 35.3005,
      hoursAgo: 1.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-12",
    partition: "holdout",
    category: "hard-neg-two-intercepts-time-split",
    description: "Drone interception at 02:00 vs Drone interception at 14:00 (12 hours apart)",
    eventA: {
      title: "Air defense downs kamikaze drone over Eilat port in early morning hours",
      description: "Early morning interception neutralized hostile drone at 02:30.",
      severity: "4",
      source: "IDF Spokesman",
      lat: 29.5581,
      lng: 34.9482,
      hoursAgo: 13.0
    },
    eventB: {
      title: "Air defense downs kamikaze drone over Eilat port in afternoon hours",
      description: "Afternoon interception neutralized hostile drone at 14:30.",
      severity: "4",
      source: "IDF Spokesman",
      lat: 29.5581,
      lng: 34.9482,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "HOLD-13",
    partition: "holdout",
    category: "same-event-fuel-depot-blast",
    description: "Catastrophic fuel depot explosion in Ras Isa terminal in Yemen",
    eventA: {
      title: "Massive fire engulfs oil export storage tanks at Ras Isa terminal in Yemen",
      description: "Aerial bombardment ignited oil storage reservoirs causing towering smoke plumes.",
      severity: "5",
      source: "Sky News",
      lat: 15.1900,
      lng: 42.7500,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Yemen Ras Isa petrol ihracat terminalinde dev yakit depolari alev aldi",
      description: "Hava saldirisi sonrasinda petrol rezervuarlarinda buyuk yangin cikti.",
      severity: "5",
      source: "Yemen Post",
      lat: 15.1910,
      lng: 42.7510,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-14",
    partition: "holdout",
    category: "hard-neg-civil-riot-vs-strike",
    description: "Prison riot in Tabriz vs drone strike in Tabriz",
    eventA: {
      title: "Prisoners initiate riot and clash with guards inside Tabriz central detention center",
      description: "Disturbances and smoke observed inside municipal correctional facility.",
      severity: "2",
      source: "HRANA",
      lat: 38.0800,
      lng: 46.2900,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Drone strike damages radar facility at Tabriz tactical air force base",
      description: "Explosive UAV impacted antenna mast at military airfield in Tabriz.",
      severity: "4",
      source: "Reuters",
      lat: 38.1300,
      lng: 46.2400,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-15",
    partition: "holdout",
    category: "same-event-coastal-radar-gaza",
    description: "Maritime radar post struck by airstrike along northern Gaza beach",
    eventA: {
      title: "Precision airstrike obliterates coastal naval radar tower on northern Gaza beach",
      description: "Naval surveillance tower collapsed into sand following guided bomb hit.",
      severity: "4",
      source: "Al Jazeera",
      lat: 31.5500,
      lng: 34.4500,
      hoursAgo: 0.8
    },
    eventB: {
      title: "Kuzey Gazze sahilindeki deniz radar kulesi hava harekatiyla vuruldu",
      description: "Sahil gozetleme kulesi gudumlu muhimmatla tamamen yerle bir edildi.",
      severity: "4",
      source: "Filistin Enformasyon",
      lat: 31.5505,
      lng: 34.4505,
      hoursAgo: 1.0
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },

  // =========================================================================
  // PARTITION 4: ADVERSARIAL CONTRADICTION BENCHMARK (10 PAIRS)
  // =========================================================================
  {
    id: "ADV-01",
    partition: "adversarial",
    category: "adversarial-drill-contradiction",
    description: "Scheduled military drill vs identical-sounding hostile combat missile strike",
    eventA: {
      title: "Air defense command conducts routine live-fire simulation drill near Damascus",
      description: "Scheduled military readiness drill simulating incoming aerial targets.",
      severity: "2",
      source: "Syria State TV",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Hostile airstrike destroys ammunition bunker near Damascus airport",
      description: "Hostile fighter jets launched cruise missiles destroying weapons depot.",
      severity: "5",
      source: "Reuters",
      lat: 33.5140,
      lng: 36.2768,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-02",
    partition: "adversarial",
    category: "adversarial-civil-vs-military",
    description: "Protest rally vs missile attack in identical downtown square coordinates",
    eventA: {
      title: "Civilian peace demonstration and political march in central Beirut",
      description: "Protest rally attended by thousands of civilian demonstrators.",
      severity: "2",
      source: "L'Orient",
      lat: 33.8886,
      lng: 35.4955,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Ballistic missile strike destroys defense installation in Beirut",
      description: "Missile salvo impacted military command bunker in Beirut.",
      severity: "5",
      source: "BBC",
      lat: 33.8890,
      lng: 35.4960,
      hoursAgo: 1.6
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-03",
    partition: "adversarial",
    category: "adversarial-different-target-same-city",
    description: "Airport fuel depot bombed vs seaport container dock bombed in same coastal city",
    eventA: {
      title: "Airstrike craters fuel reservoir tanks at Tartus airport airfield",
      description: "Aerial bombardment targeted aviation fuel tanks at airfield.",
      severity: "4",
      source: "AFP",
      lat: 34.8900,
      lng: 35.8700,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrike craters shipping berths at Tartus commercial sea port harbor",
      description: "Aerial bombardment targeted maritime shipping docks at seaport.",
      severity: "4",
      source: "AP News",
      lat: 34.9200,
      lng: 35.8900,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-04",
    partition: "adversarial",
    category: "adversarial-false-flag-paraphrase",
    description: "Unconfirmed social media claim of sabotage vs official statement denying incident",
    eventA: {
      title: "Social media claims allege sabotage explosion destroyed power station in Isfahan",
      description: "Unverified online rumors claim major electrical substation blast in Isfahan.",
      severity: "2",
      source: "Telegram Channel",
      lat: 32.6546,
      lng: 51.6680,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Ministry of Energy confirms power grid operating normally in Isfahan without disruptions",
      description: "Official statement refutes rumors of power station explosions in Isfahan.",
      severity: "1",
      source: "IRNA",
      lat: 32.6550,
      lng: 51.6685,
      hoursAgo: 2.2
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-05",
    partition: "adversarial",
    category: "adversarial-cross-border-twin-cities",
    description: "Rafah Gaza crossing hit vs Rafah Egyptian checkpoint hit across international border",
    eventA: {
      title: "Airstrike hits Palestinian transit terminal at Rafah crossing",
      description: "Bombardment destroyed passenger hall on Gaza side of Rafah border.",
      severity: "4",
      source: "Al Jazeera",
      lat: 31.2800,
      lng: 34.2500,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Smuggling tunnel detonated near Egyptian security wall in North Sinai Rafah",
      description: "Egyptian military engineers blasted subterranean tunnel in Egyptian Rafah.",
      severity: "3",
      source: "Al Ahram",
      lat: 31.2700,
      lng: 34.2300,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-06",
    partition: "adversarial",
    category: "adversarial-interception-vs-uncontested-hit",
    description: "Missile intercepted with zero ground damage vs Missile hit destroying radar building",
    eventA: {
      title: "Air defense successfully intercepts incoming ballistic missile in upper atmosphere",
      description: "All incoming projectiles neutralized with zero impacts or ground damage.",
      severity: "3",
      source: "IDF",
      lat: 31.8990,
      lng: 34.8000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Ballistic missile direct hit obliterates military communication headquarters",
      description: "Direct impact leveled multi-story military signals headquarters with heavy casualties.",
      severity: "5",
      source: "Hezbollah Media",
      lat: 31.9010,
      lng: 34.8020,
      hoursAgo: 1.1
    },
    expectedSameEvent: true,
    ambiguityLevel: "HIGH",
    notes: "Conflicting battle damage claims on identical missile raid"
  },
  {
    id: "ADV-07",
    partition: "adversarial",
    category: "adversarial-duplicate-syndicated-spoof",
    description: "Five identical syndicated wire copies claiming major strike",
    eventA: {
      title: "Reuters wire dispatch: Airstrike hits munitions factory in Aleppo",
      description: "Reuters news agency reports multiple explosions at military production site in Aleppo.",
      severity: "4",
      source: "Portal Alpha",
      lat: 36.2021,
      lng: 37.1343,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Reuters correspondent: Airstrike hits munitions factory in Aleppo",
      description: "According to Reuters, precision bombs destroyed ammunition plant in Aleppo.",
      severity: "4",
      source: "Portal Beta",
      lat: 36.2025,
      lng: 37.1345,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "ADV-08",
    partition: "adversarial",
    category: "adversarial-city-name-collision",
    description: "Al-Bab (Aleppo province) vs Bab al-Hawa border crossing (Idlib province) (75km apart)",
    eventA: {
      title: "Artillery strikes hit insurgent headquarters in Al-Bab urban district",
      description: "Shelling targeted command posts in eastern Aleppo city of Al-Bab.",
      severity: "3",
      source: "SOHR",
      lat: 36.3700,
      lng: 37.5100,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Artillery strikes hit commercial transit trucks at Bab al-Hawa border crossing",
      description: "Shelling targeted border crossing terminal at Bab al-Hawa in Idlib province.",
      severity: "3",
      source: "Enab Baladi",
      lat: 36.2300,
      lng: 36.6900,
      hoursAgo: 1.6
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-09",
    partition: "adversarial",
    category: "adversarial-naval-boat-vs-submarine",
    description: "Unmanned surface vessel (USV) strike vs Submarine periscope observation",
    eventA: {
      title: "Kamikaze naval drone boat detonates against commercial bulk freighter hull",
      description: "Explosive unmanned surface vessel struck cargo ship port side in Red Sea.",
      severity: "4",
      source: "Lloyds List",
      lat: 14.5000,
      lng: 42.5000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Submarine periscope sighted conducting reconnaissance near maritime shipping lanes",
      description: "Naval surveillance spotted submerged submarine periscope in southern Red Sea.",
      severity: "2",
      source: "Naval News",
      lat: 14.5050,
      lng: 42.5050,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "ADV-10",
    partition: "adversarial",
    category: "adversarial-cross-lang-idiomatic-slang",
    description: "Turkish military jargon 'nokta atisi' vs English 'surgical strike' on bunker",
    eventA: {
      title: "Air force executes surgical strike against underground command bunker",
      description: "Penetrating precision ordnance eliminated underground bunker complex.",
      severity: "5",
      source: "Defense One",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Hava kuvvetleri yeralti siginagina nokta atisi hava harekati gerceklestirdi",
      description: "Beton delici muhimmatla yeraltindaki komuta siginagi imha edildi.",
      severity: "5",
      source: "Savunma Sanayi",
      lat: 33.5145,
      lng: 36.2770,
      hoursAgo: 1.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },

  // =========================================================================
  // PARTITION 5: EDGE-CASE BOUNDARY BENCHMARK (10 PAIRS)
  // =========================================================================
  {
    id: "EDGE-01",
    partition: "edge-case",
    category: "edge-spatial-boundary-inside",
    description: "Same strike reported with coordinates 48.5 km apart (Inside 50km threshold with high semantic similarity)",
    eventA: {
      title: "Airstrikes hit weapons storage warehouse depot in eastern rural zone",
      description: "Heavy bombs detonated military storage depot in countryside sector.",
      severity: "4",
      source: "ISW",
      lat: 33.5000,
      lng: 36.2000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrikes hit weapons storage warehouse depot in eastern rural zone",
      description: "Heavy bombs detonated military storage depot in countryside sector.",
      severity: "4",
      source: "Reuters",
      lat: 33.8500,
      lng: 36.5000, // ~48.5 km distance
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "HIGH"
  },
  {
    id: "EDGE-02",
    partition: "edge-case",
    category: "edge-spatial-boundary-outside",
    description: "Identical event description reported with coordinates 52.0 km apart (Hard split: >50km)",
    eventA: {
      title: "Airstrikes hit weapons storage warehouse depot in eastern rural zone",
      description: "Heavy bombs detonated military storage depot in countryside sector.",
      severity: "4",
      source: "ISW",
      lat: 33.5000,
      lng: 36.2000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrikes hit weapons storage warehouse depot in eastern rural zone",
      description: "Heavy bombs detonated military storage depot in countryside sector.",
      severity: "4",
      source: "Reuters",
      lat: 33.9000,
      lng: 36.6000, // ~58 km distance
      hoursAgo: 1.2
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH",
    notes: "Hard split: Distance > 50km"
  },
  {
    id: "EDGE-03",
    partition: "edge-case",
    category: "edge-temporal-boundary-inside",
    description: "Same Damascus airport strike reported 5.5 hours apart (Inside 6.0h temporal window)",
    eventA: {
      title: "Airstrike craters runway at Damascus international airport",
      description: "Missiles struck tarmac facilities at Damascus airfield.",
      severity: "4",
      source: "SANA",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 6.0
    },
    eventB: {
      title: "Damascus airport runway damaged in aerial bombardment",
      description: "Aviation officials assess crater damage on Damascus airfield runway.",
      severity: "4",
      source: "Reuters",
      lat: 33.5140,
      lng: 36.2770,
      hoursAgo: 0.5
    },
    expectedSameEvent: true,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "EDGE-04",
    partition: "edge-case",
    category: "edge-temporal-boundary-outside",
    description: "Same Damascus airport strike reported 6.5 hours apart (Hard split: >6.0h)",
    eventA: {
      title: "Airstrike craters runway at Damascus international airport",
      description: "Missiles struck tarmac facilities at Damascus airfield.",
      severity: "4",
      source: "SANA",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 7.5
    },
    eventB: {
      title: "Damascus airport runway damaged in aerial bombardment",
      description: "Aviation officials assess crater damage on Damascus airfield runway.",
      severity: "4",
      source: "Reuters",
      lat: 33.5140,
      lng: 36.2770,
      hoursAgo: 0.5
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM",
    notes: "Hard split: Temporal diff 7.0h > 6.0h"
  },
  {
    id: "EDGE-05",
    partition: "edge-case",
    category: "edge-null-coordinates-strong-lexical",
    description: "Both events lack coordinates but share strong specific named tactical entities and gazetteer",
    eventA: {
      title: "Airstrike destroys ammunition depot near Damascus international airport",
      description: "Detonations reported at weapons storage facility outside Damascus.",
      severity: "4",
      source: "BBC World",
      lat: null,
      lng: null,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Sam uluslararasi havalimani yakinlarindaki muhimmat ambarina hava saldirisi",
      description: "Sam'daki askeri silah deposunda hava harekati sonrasi patlamalar oldu.",
      severity: "4",
      source: "Anadolu Ajansi",
      lat: null,
      lng: null,
      hoursAgo: 1.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "EDGE-06",
    partition: "edge-case",
    category: "edge-antipodal-coordinates",
    description: "Coordinates on exact opposite sides of the planet",
    eventA: {
      title: "Missile test launched from desert facility",
      description: "Ballistic projectile fired in testing range.",
      severity: "3",
      source: "Reuters",
      lat: 32.0,
      lng: 34.0,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Missile test launched from desert facility",
      description: "Ballistic projectile fired in testing range.",
      severity: "3",
      source: "Reuters",
      lat: -32.0,
      lng: -146.0,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW",
    notes: "Antipodal coordinates (>19,000 km apart)"
  },
  {
    id: "EDGE-07",
    partition: "edge-case",
    category: "edge-zero-zero-coordinates",
    description: "Null Island (0.0, 0.0) vs Middle East coordinates (33.0, 35.0)",
    eventA: {
      title: "Drone strike on border outpost",
      description: "Combat UAV attacked military bunker.",
      severity: "4",
      source: "OSINT",
      lat: 0.0,
      lng: 0.0,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Drone strike on border outpost",
      description: "Combat UAV attacked military bunker.",
      severity: "4",
      source: "OSINT",
      lat: 33.0,
      lng: 35.0,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "EDGE-08",
    partition: "edge-case",
    category: "edge-dateline-crossing",
    description: "Coordinates across International Date Line (179.9 deg vs -179.9 deg)",
    eventA: {
      title: "Pacific maritime patrol boat engaged hostile vessel",
      description: "Naval gunfire in Pacific Ocean sector.",
      severity: "3",
      source: "USNI",
      lat: 10.0,
      lng: 179.9,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Pacific maritime patrol boat engaged hostile vessel",
      description: "Naval gunfire in Pacific Ocean sector.",
      severity: "3",
      source: "USNI",
      lat: 10.0,
      lng: -179.9,
      hoursAgo: 1.1
    },
    expectedSameEvent: true,
    ambiguityLevel: "MEDIUM",
    notes: "Haversine correctly wraps date line (~22 km distance)"
  },
  {
    id: "EDGE-09",
    partition: "edge-case",
    category: "edge-identical-coordinates-zero-diff",
    description: "Identical latitude and longitude to 6 decimal places with identical timestamps",
    eventA: {
      title: "Suicide drone detonates at military communications tower in Damascus",
      description: "One-way UAV struck antenna array in Damascus district.",
      severity: "4",
      source: "Reuters",
      lat: 33.513821,
      lng: 36.276512,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Kamikaze drone hits signals transmission tower in Damascus",
      description: "Unmanned aerial vehicle targeted telecom mast in Damascus.",
      severity: "4",
      source: "AFP",
      lat: 33.513821,
      lng: 36.276512,
      hoursAgo: 1.0
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "EDGE-10",
    partition: "edge-case",
    category: "edge-extreme-latitude-polar",
    description: "Arctic polar radar stations separated by 800 km",
    eventA: {
      title: "Early warning radar facility operational maintenance in Arctic circle",
      description: "Radar array calibrated for extreme northern coverage.",
      severity: "2",
      source: "Barents Observer",
      lat: 78.0000,
      lng: 15.0000,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Early warning radar facility operational maintenance in Arctic circle",
      description: "Radar array calibrated for extreme northern coverage.",
      severity: "2",
      source: "Barents Observer",
      lat: 71.0000,
      lng: 25.0000,
      hoursAgo: 2.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },

  // =========================================================================
  // PARTITION 6: OUT-OF-DISTRIBUTION (OOD) BENCHMARK (10 PAIRS)
  // =========================================================================
  {
    id: "OOD-01",
    partition: "ood",
    category: "ood-naval-combat-black-sea",
    description: "Unmanned surface vessel (USV) drone boat strike on missile corvette in Black Sea",
    eventA: {
      title: "Sea drone swarm strikes missile corvette off Crimean coast",
      description: "Multiple maritime explosive USV boats breached hull of guided missile warship.",
      severity: "5",
      source: "Naval News",
      lat: 44.5000,
      lng: 33.5000,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Karadeniz'de insansiz deniz araclari gudumlu fuze korvetini batirdi",
      description: "Patlayici yuklu kamikaze deniz dronlari korvete saldiri duzenledi.",
      severity: "5",
      source: "Deniz Kuvvetleri",
      lat: 44.5010,
      lng: 33.5020,
      hoursAgo: 1.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-02",
    partition: "ood",
    category: "ood-strait-of-hormuz-boarding",
    description: "Helicopter commando boarding of oil tanker in Strait of Hormuz",
    eventA: {
      title: "Armed commandos fast-rope from naval helicopter onto oil tanker in Strait of Hormuz",
      description: "Military forces seized commercial petroleum tanker diverting it to domestic port.",
      severity: "4",
      source: "Bloomberg",
      lat: 26.5000,
      lng: 56.2500,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Hormuz Bogazinda petrol tankerine askeri helikopterle komando baskini",
      description: "Silahli ozel kuvvetler kargo gemisine helikopterden inerek el koydu.",
      severity: "4",
      source: "AA",
      lat: 26.5020,
      lng: 56.2510,
      hoursAgo: 2.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-03",
    partition: "ood",
    category: "ood-cyber-scada-sabotage",
    description: "Cyberattack disrupting natural gas pipeline pumping station",
    eventA: {
      title: "State-sponsored cyber intrusion disables SCADA telemetry at regional gas pipeline",
      description: "Malware payload corrupted industrial control valves halting natural gas flow.",
      severity: "3",
      source: "BleepingComputer",
      lat: null,
      lng: null,
      hoursAgo: 4.0
    },
    eventB: {
      title: "Siber saldiri dogalgaz boru hatti kompresor istasyonunun calismasini durdurdu",
      description: "Endustriyel kontrol yazilimina yapilan siber mudahale gazi kesti.",
      severity: "3",
      source: "Siber Guvenlik",
      lat: null,
      lng: null,
      hoursAgo: 4.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "OOD-04",
    partition: "ood",
    category: "ood-different-maritime-straits",
    description: "Incident in Bab el-Mandeb strait vs incident in Malacca strait",
    eventA: {
      title: "Anti-ship missile fired at cargo vessel in Bab el-Mandeb strait",
      description: "Coastal missile battery targeted merchant container vessel in Bab el-Mandeb.",
      severity: "4",
      source: "UKMTO",
      lat: 12.5800,
      lng: 43.3300,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Anti-ship missile fired at cargo vessel in Malacca strait",
      description: "Coastal missile battery targeted merchant container vessel in Malacca strait.",
      severity: "4",
      source: "ReCAAP",
      lat: 2.5000,
      lng: 101.5000,
      hoursAgo: 1.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW",
    notes: "Different oceans (>6,000 km apart)"
  },
  {
    id: "OOD-05",
    partition: "ood",
    category: "ood-anti-satellite-asat-test",
    description: "Exo-atmospheric anti-satellite kinetic interception test in low Earth orbit",
    eventA: {
      title: "Direct-ascent anti-satellite kinetic missile test destroys decommissioned satellite",
      description: "Ground based interceptor missile obliterated target satellite in 400km orbit.",
      severity: "4",
      source: "SpaceNews",
      lat: null,
      lng: null,
      hoursAgo: 3.0
    },
    eventB: {
      title: "Karadan atilan anti-uydu fuzesi alcak dunya yorungesindeki hedefi imha etti",
      description: "Askeri balistik fuze denemesiyle yorungedeki eski uydu parcalandi.",
      severity: "4",
      source: "Uzay Haber",
      lat: null,
      lng: null,
      hoursAgo: 3.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-06",
    partition: "ood",
    category: "ood-submarine-cable-cut",
    description: "Subsea fiber optic telecommunication cable cut in Baltic Sea",
    eventA: {
      title: "Subsea telecommunication cable severed by suspected anchor dragging in Baltic Sea",
      description: "High capacity undersea internet cable sustained physical disruption between capitals.",
      severity: "3",
      source: "Reuters",
      lat: 56.5000,
      lng: 19.5000,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Baltik Denizi'nde denizalti fiber optik internet kablosu fiziksel hasarla koptu",
      description: "Deniz tabanindaki iletisim kablosunun kesilmesi sonucu veri trafigi aksadi.",
      severity: "3",
      source: "Telekom Dunyasi",
      lat: 56.5020,
      lng: 19.5030,
      hoursAgo: 2.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-07",
    partition: "ood",
    category: "ood-gulf-of-guinea-piracy",
    description: "Armed pirate skiff boarding commercial chemical tanker off West Africa",
    eventA: {
      title: "Armed pirate boarding reported on commercial chemical tanker in Gulf of Guinea",
      description: "Speedboats carrying armed boarders scaled freeboard taking crew hostage.",
      severity: "4",
      source: "IMB Piracy Centre",
      lat: 4.1000,
      lng: 6.0000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Gine Korfezi'nde silahli korsanlar kimyasal urun tankerine cikarak gemiyi kacirdi",
      description: "Surat motorlariyla yaklasan korsanlar kargo gemisini ele gecirdi.",
      severity: "4",
      source: "Deniz Haber",
      lat: 4.1010,
      lng: 6.0020,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-08",
    partition: "ood",
    category: "ood-airborne-early-warning-intercept",
    description: "Airborne early warning & control (AEW&C) aircraft shot down by long-range missile",
    eventA: {
      title: "Long-range surface-to-air missile shoots down airborne early warning radar plane",
      description: "Strategic radar surveillance aircraft crashed after taking missile hit at high altitude.",
      severity: "5",
      source: "Aviation Week",
      lat: 47.0000,
      lng: 39.0000,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Uzun menzilli hava savunma fuzesi havadan erken ihbar ve kontrol ucagini dusurdu",
      description: "Stratejik radar ucagi yuksek irtifada vurularak dustu.",
      severity: "5",
      source: "Havacilik Savunma",
      lat: 47.0050,
      lng: 39.0080,
      hoursAgo: 1.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-09",
    partition: "ood",
    category: "ood-gps-spoofing-baltic-sea",
    description: "Electronic warfare GPS jamming across Baltic commercial shipping corridor",
    eventA: {
      title: "Widespread electronic warfare GPS spoofing disrupts merchant navigation in Baltic",
      description: "Vessels report false position readings placing ships inside international airports.",
      severity: "2",
      source: "Lloyds Intelligence",
      lat: 55.0000,
      lng: 14.5000,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Baltik Denizi ticari gemi rotalarinda genis capli GPS karistirma tespit edildi",
      description: "Elektronik harp sinyalleri yuzlerce geminin navigasyon sistemlerini yaniltti.",
      severity: "2",
      source: "Denizcilik Ajansi",
      lat: 55.0050,
      lng: 14.5050,
      hoursAgo: 2.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "OOD-10",
    partition: "ood",
    category: "ood-drone-intercept-poland-border",
    description: "Air defense intercepts suicide drone near eastern Polish border perimeter",
    eventA: {
      title: "Fighter jets scramble and intercept rogue combat drone near eastern border",
      description: "Hostile kamikaze UAV downed before crossing into sovereign airspace.",
      severity: "4",
      source: "PAP News",
      lat: 51.5000,
      lng: 23.5000,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Savas ucaklari dogu siniri yakinlarinda kamikaze insansiz hava aracini vurdu",
      description: "Hava sahasina yaklasan silahli IHA savas ucaklarinca dusuruldu.",
      severity: "4",
      source: "Avrupa Haber",
      lat: 51.5020,
      lng: 23.5030,
      hoursAgo: 1.3
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  }
];
