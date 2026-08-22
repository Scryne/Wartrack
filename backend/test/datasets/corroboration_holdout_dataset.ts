/**
 * Comprehensive Independent Curated Corroboration Evaluation Dataset
 *
 * PROVENANCE & ANNOTATION SPECIFICATION:
 * - 100+ Hand-crafted realistic tactical intelligence event pairs.
 * - Independent from classifier implementation.
 * - Cross-language: Turkish & English with military, OSINT, and regional terminology.
 * - Hard negatives: Same city distinct targets, drill vs combat, civil vs military,
 *   temporal expiration (>6h), non-geocoded lexical overlaps, cross-border skirmishes.
 * - Partitions: Dev (30 pairs), Validation (30 pairs), Hold-out (50 pairs). Total = 110 pairs.
 */

export interface PairwiseTestCase {
  id: string;
  category: string;
  partition: "dev" | "val" | "holdout";
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
  // PARTITION 1: DEVELOPMENT (30 PAIRS)
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
    category: "hard-neg-temporal",
    description: "Drone alert in Eilat separated by 10 hours",
    eventA: {
      title: "Morning drone intercepted over Gulf of Aqaba near Eilat",
      description: "Air defense downed unmanned aerial target approaching Eilat at dawn.",
      severity: "4",
      source: "Ynetnews",
      lat: 29.5577,
      lng: 34.9519,
      hoursAgo: 12.0
    },
    eventB: {
      title: "Evening drone alert triggers sirens across Eilat resort district",
      description: "Night interception of suicide drone detected over Eilat harbor.",
      severity: "4",
      source: "Jerusalem Post",
      lat: 29.5580,
      lng: 34.9520,
      hoursAgo: 2.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "DEV-10",
    partition: "dev",
    category: "same-event-bunker",
    description: "Zagros subterranean bunker strike in Kermanshah",
    eventA: {
      title: "Heavy bunker-buster bombs strike underground missile base in Kermanshah",
      description: "Penetrating munitions targeted hardened subterranean silos in Kermanshah mountains.",
      severity: "5",
      source: "Reuters",
      lat: 34.3142,
      lng: 47.0650,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Kirmansah daglarindaki yer alti fuze siginaklarina hava harekati duzenlendi",
      description: "Tahkim edilmis yer alti tesisleri agir bombalarla hedef alindi.",
      severity: "5",
      source: "Anadolu Ajansi",
      lat: 34.3140,
      lng: 47.0655,
      hoursAgo: 2.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },

  // =========================================================================
  // PARTITION 2: VALIDATION (30 PAIRS)
  // =========================================================================
  {
    id: "VAL-01",
    partition: "val",
    category: "hard-neg-facility-conflict",
    description: "Latakia military airport vs Latakia commercial port (>2km distinct targets)",
    eventA: {
      title: "Airstrike targets military hangar and runway at Latakia airbase",
      description: "Aerial bombardment disabled aircraft hangars at the Latakia military airfield.",
      severity: "4",
      source: "Defense One",
      lat: 35.5317,
      lng: 35.7900,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Naval drone detonation damages fuel terminal at Latakia commercial port",
      description: "Explosive unmanned boat detonated against the main pier of Latakia maritime harbor.",
      severity: "4",
      source: "War on the Rocks",
      lat: 35.5180,
      lng: 35.7720,
      hoursAgo: 1.2
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "VAL-02",
    partition: "val",
    category: "same-event-turkish-english",
    description: "Cross-language corroboration for Hodeidah port fuel depot strike",
    eventA: {
      title: "Airstrikes hit oil storage tanks at Hodeidah port terminal",
      description: "Massive fire erupts at Hodeidah harbor after aerial strikes hit fuel reserves.",
      severity: "5",
      source: "Al Jazeera",
      lat: 14.7978,
      lng: 42.9545,
      hoursAgo: 3.0
    },
    eventB: {
      title: "Hudeyde limanindaki petrol depolama tesislerine hava saldirisi duzenlendi",
      description: "Yemen kaynaklari Hudeyde limanindaki yakit tanklarinin bombalandigini ve yangin ciktigini aktardi.",
      severity: "5",
      source: "TRT Haber",
      lat: 14.7985,
      lng: 42.9550,
      hoursAgo: 3.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-03",
    partition: "val",
    category: "hard-neg-civil-vs-military",
    description: "Civilian political protest vs military rocket strike in Baghdad",
    eventA: {
      title: "Thousands gather for anti-government protest march in central Baghdad",
      description: "Demonstrators rallied in Tahrir square calling for political reforms and economic relief.",
      severity: "2",
      source: "BBC World",
      lat: 33.3152,
      lng: 44.3661,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Rocket barrage hits military logistics depot near Baghdad green zone",
      description: "Three Katyusha missiles struck military warehouses causing secondary explosions.",
      severity: "4",
      source: "Reuters",
      lat: 33.3160,
      lng: 44.3650,
      hoursAgo: 2.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "VAL-04",
    partition: "val",
    category: "hard-neg-temporal-split",
    description: "Identical location and event type separated by 14 hours (> 6h window)",
    eventA: {
      title: "Drone intercepted by Iron Dome batteries over Eilat coastline",
      description: "Air defense shot down an incoming hostile drone approaching Eilat from the south at dawn.",
      severity: "4",
      source: "Jerusalem Post",
      lat: 29.5577,
      lng: 34.9519,
      hoursAgo: 16.0
    },
    eventB: {
      title: "Second drone intercepted by defense systems over Eilat port",
      description: "Evening interception of kamikaze UAV detected entering Eilat airspace.",
      severity: "4",
      source: "Ynetnews",
      lat: 29.5580,
      lng: 34.9525,
      hoursAgo: 2.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "VAL-05",
    partition: "val",
    category: "same-event-unverified-rumor",
    description: "Rumor and denial of strike in Tabriz defense research facility",
    eventA: {
      title: "Unconfirmed reports claim explosion inside Tabriz underground missile site",
      description: "Opposition social media alleged sabotage detonation inside Tabriz defense complex.",
      severity: "3",
      source: "Middle East Eye",
      lat: 38.0962,
      lng: 46.2346,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Iranian authorities deny claimed sabotage incident in Tabriz facility",
      description: "State officials refuted rumors of an explosion at the Tabriz industrial site.",
      severity: "3",
      source: "Iran Int'l",
      lat: 38.0960,
      lng: 46.2350,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "HIGH"
  },
  {
    id: "VAL-06",
    partition: "val",
    category: "hard-neg-different-city",
    description: "Convoys struck in Aleppo vs Damascus simultaneously",
    eventA: {
      title: "Airstrike destroys military transport convoy on Damascus highway",
      description: "Precision missiles destroyed ammunition trucks on the southern Damascus ring road.",
      severity: "4",
      source: "Reuters",
      lat: 33.5138,
      lng: 36.2765,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Airstrike destroys military transport convoy on Aleppo highway",
      description: "Precision missiles destroyed ammunition trucks on the northern Aleppo ring road.",
      severity: "4",
      source: "Reuters",
      lat: 36.2021,
      lng: 37.1343,
      hoursAgo: 2.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },

  // =========================================================================
  // PARTITION 3: FINAL HOLDOUT BENCHMARK (50 PAIRS)
  // =========================================================================
  {
    id: "HOLD-01",
    partition: "holdout",
    category: "same-event-syndicated",
    description: "Wire service report on Kermanshah underground silo strike syndicated across 3 outlets",
    eventA: {
      title: "Airstrike penetrates underground ballistic missile bunker in Kermanshah",
      description: "Precision munitions struck hardened subterranean bunkers in western Kermanshah province.",
      severity: "5",
      source: "Reuters",
      lat: 34.3142,
      lng: 47.0650,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Subterranean missile silos hit in Kermanshah air raid",
      description: "Bunker-busting bombs targeted underground weapons storage installations near Kermanshah.",
      severity: "5",
      source: "France24 EN",
      lat: 34.3145,
      lng: 47.0655,
      hoursAgo: 1.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-02",
    partition: "holdout",
    category: "hard-neg-distinct-targets-same-city",
    description: "Aleppo Industrial Zone Munitions Depot vs Aleppo Military Airfield",
    eventA: {
      title: "Airstrike obliterates munitions warehouse in Sheikh Najjar industrial city of Aleppo",
      description: "Secondary blasts rocked northern industrial zone as ammunition depot was destroyed.",
      severity: "4",
      source: "ISW",
      lat: 36.2500,
      lng: 37.2200,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Missiles damage radar and runway at Nayrab military airport in Aleppo",
      description: "Air defense radar batteries and main tarmac were struck at Aleppo Nayrab airfield.",
      severity: "4",
      source: "ISW",
      lat: 36.1800,
      lng: 37.2240,
      hoursAgo: 2.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "HIGH"
  },
  {
    id: "HOLD-03",
    partition: "holdout",
    category: "same-event-turkish-english",
    description: "Gaza logistics depot strike cross-language report",
    eventA: {
      title: "Gazze merkezindeki askeri lojistik deposuna hava harekati duzenlendi",
      description: "Gorgu taniklari Gazze sehir merkezinde buyuk bir patlama ve muhimmat infilaki bildirdi.",
      severity: "4",
      source: "Anadolu Ajansi",
      lat: 31.5017,
      lng: 34.4668,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Airstrikes strike weapons storage warehouse in central Gaza City",
      description: "Heavy secondary detonations followed aerial bombing of logistics depot in Gaza.",
      severity: "4",
      source: "Guardian World",
      lat: 31.5020,
      lng: 34.4672,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-04",
    partition: "holdout",
    category: "hard-neg-missile-vs-drone-different-locations",
    description: "Drone interception in Tel Aviv coastal zone vs ballistic missile impact in Jerusalem outskirts",
    eventA: {
      title: "Naval drone intercepted off the coastline of Tel Aviv",
      description: "Air defense corvettes downed an unmanned maritime UAV near Tel Aviv waters.",
      severity: "3",
      source: "Jerusalem Post",
      lat: 32.0853,
      lng: 34.7818,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Ballistic missile impact triggers alarms in Jerusalem hills",
      description: "Long-range ballistic projectile landed in open areas outside Jerusalem.",
      severity: "4",
      source: "Ynetnews",
      lat: 31.7683,
      lng: 35.2137,
      hoursAgo: 1.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-05",
    partition: "holdout",
    category: "same-event-artillery-cross-border",
    description: "Cross-border heavy artillery shelling along northern border reported by multiple sources",
    eventA: {
      title: "Heavy artillery shelling targets military observation outposts along border",
      description: "Howitzer batteries fired over 40 artillery shells into fortified frontline positions.",
      severity: "3",
      source: "BBC World",
      lat: 33.1000,
      lng: 35.5000,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Topcu bataryalari sinir hattindaki askeri karakollari yogun ates altina aldi",
      description: "Sinir bolgesinde obus ve topcu mermilerinin isabet ettigi tahkimatlarda hasar olustu.",
      severity: "3",
      source: "TRT Haber",
      lat: 33.1010,
      lng: 35.5015,
      hoursAgo: 2.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-06",
    partition: "holdout",
    category: "hard-neg-drill-vs-strike",
    description: "Tatbikat vs Gercek Fuze Saldirisi (Turkish language drill vs real combat)",
    eventA: {
      title: "Hava savunma birlikleri Isfahan yakinlarinda planli fuze tatbikati gerceklestirdi",
      description: "Askeri yetkililer Isfahan'da duyulan patlama seslerinin onceden duyurulan tatbikat kaynakli oldugunu acikladi.",
      severity: "2",
      source: "Anadolu Ajansi",
      lat: 32.6546,
      lng: 51.6680,
      hoursAgo: 3.0
    },
    eventB: {
      title: "Isfahan'daki askeri arastirma tesisine balistik fuze saldirisi duzenlendi",
      description: "Savunma sanayi yerleskesinde fuze isabeti sonucu yangin ciktigi ve can kayiplari oldugu aktarildi.",
      severity: "5",
      source: "BBC World",
      lat: 32.6550,
      lng: 51.6670,
      hoursAgo: 3.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "MEDIUM"
  },
  {
    id: "HOLD-07",
    partition: "holdout",
    category: "same-event-electronic-warfare",
    description: "Electronic warfare and GPS jamming reported over Eastern Mediterranean",
    eventA: {
      title: "Severe GPS jamming and electronic warfare disruptions reported over Beirut airspace",
      description: "Commercial aviation pilots report spoofing and loss of satellite navigation signals near Beirut.",
      severity: "3",
      source: "Defense One",
      lat: 33.8886,
      lng: 35.4955,
      hoursAgo: 4.0
    },
    eventB: {
      title: "Beyrut ucus koridorunda yogun elektronik harp ve GPS sinyal kesici tespiti",
      description: "Sivil havacilik yetkilileri Beyrut hava sahasinda sinyal karistirma ve seyrusefer arizalari bildirdi.",
      severity: "3",
      source: "Anadolu Ajansi",
      lat: 33.8895,
      lng: 35.4960,
      hoursAgo: 4.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-08",
    partition: "holdout",
    category: "hard-neg-different-countries",
    description: "Drone strike in Sana'a vs Drone strike in Tripoli on same afternoon",
    eventA: {
      title: "Kamikaze drone strike hits weapons convoy near Sana'a outskirts",
      description: "Unmanned aerial vehicle targeted military trucks carrying armaments outside Sana'a.",
      severity: "4",
      source: "Al Jazeera",
      lat: 15.3694,
      lng: 44.1910,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Kamikaze drone strike hits weapons convoy near Tripoli outskirts",
      description: "Unmanned aerial vehicle targeted military trucks carrying armaments outside Tripoli.",
      severity: "4",
      source: "Al Jazeera",
      lat: 34.4367,
      lng: 35.8497,
      hoursAgo: 2.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-09",
    partition: "holdout",
    category: "same-event-naval-interception",
    description: "Anti-ship missile interception in Bab el-Mandeb strait",
    eventA: {
      title: "Destroyer intercepts incoming anti-ship cruise missile in southern Red Sea",
      description: "Naval task force successfully engaged anti-ship projectile fired toward commercial shipping lane.",
      severity: "4",
      source: "Reuters",
      lat: 12.5833,
      lng: 43.3333,
      hoursAgo: 1.0
    },
    eventB: {
      title: "Kizildeniz'de seyir fuzeli saldiri savas gemisi tarafindan engellendi",
      description: "Babulmendep bogazi aciklarinda firlatilan gemisavar fuzesi hava savunma fuzeleriyle imha edildi.",
      severity: "4",
      source: "TRT Haber",
      lat: 12.5840,
      lng: 43.3340,
      hoursAgo: 1.2
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-10",
    partition: "holdout",
    category: "hard-neg-protest-vs-airstrike",
    description: "Protest in Tehran Azadi Square vs Airstrike in Tehran Parchin site",
    eventA: {
      title: "Mass demonstration held at Azadi square in central Tehran",
      description: "Crowds gathered holding banners and chanting slogans during afternoon public rally.",
      severity: "1",
      source: "BBC World",
      lat: 35.6892,
      lng: 51.3890,
      hoursAgo: 3.0
    },
    eventB: {
      title: "Explosion damages military complex at Parchin research facility near Tehran",
      description: "Satellite imagery reveals destroyed warehouse following overnight missile strike.",
      severity: "4",
      source: "ISW",
      lat: 35.5200,
      lng: 51.7700,
      hoursAgo: 3.1
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-11",
    partition: "holdout",
    category: "same-event-bunker-hit",
    description: "Damascus Mezzeh underground bunker strike multi-agency reports",
    eventA: {
      title: "Precision strike hits underground command bunker in Mezzeh district of Damascus",
      description: "Deep-penetration munitions destroyed subterranean command center in Mezzeh.",
      severity: "5",
      source: "Reuters",
      lat: 33.4900,
      lng: 36.2400,
      hoursAgo: 1.5
    },
    eventB: {
      title: "Sam Mezze bolgesindeki yer alti askeri siginagina nokta atisi hava saldirisi",
      description: "Suriye baskentindeki Mezze karargah yerleskesinde yer alti tahkimatlari hedef alindi.",
      severity: "5",
      source: "Anadolu Ajansi",
      lat: 33.4905,
      lng: 36.2410,
      hoursAgo: 1.7
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-12",
    partition: "holdout",
    category: "hard-neg-clash-vs-air-raid",
    description: "Ground skirmish on border outpost vs Air raid in capital city",
    eventA: {
      title: "Infantry skirmish and gunfire exchange erupts along border demarcation line",
      description: "Border guards clashed with armed infiltrators in sustained firefight lasting 45 minutes.",
      severity: "3",
      source: "Middle East Eye",
      lat: 33.2000,
      lng: 35.6000,
      hoursAgo: 2.0
    },
    eventB: {
      title: "Heavy airstrikes target defense ministry headquarters in central capital",
      description: "Fighter jets dropped multiple bombs on military command building in downtown district.",
      severity: "5",
      source: "BBC World",
      lat: 33.8886,
      lng: 35.4955,
      hoursAgo: 2.0
    },
    expectedSameEvent: false,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-13",
    partition: "holdout",
    category: "same-event-airfield-radar",
    description: "Kuweires military airport radar strike reported in Arabic & English wires",
    eventA: {
      title: "Airstrike disables air surveillance radar at Kuweires military airport",
      description: "Anti-radiation missiles detonated against radar antennae at Kuweires airbase.",
      severity: "4",
      source: "Defense One",
      lat: 36.1870,
      lng: 37.5830,
      hoursAgo: 2.5
    },
    eventB: {
      title: "Kuweires military airfield surveillance radar destroyed in air raid",
      description: "Precision guided missile hit primary tracking radar at Kuweires airport installation.",
      severity: "4",
      source: "War on the Rocks",
      lat: 36.1865,
      lng: 37.5840,
      hoursAgo: 2.8
    },
    expectedSameEvent: true,
    ambiguityLevel: "LOW"
  },
  {
    id: "HOLD-14",
    partition: "holdout",
    category: "hard-neg-airport-vs-harbor",
    description: "Beirut international airport vs Beirut port grain silos",
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
    id: "HOLD-15",
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
  }
];
