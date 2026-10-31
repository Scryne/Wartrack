const GEO_MAP: Record<string, [number, number]> = {
  israel: [31.0461, 34.8516],
  'tel aviv': [32.0853, 34.7818],
  jerusalem: [31.7683, 35.2137],
  haifa: [32.794, 34.9896],
  gaza: [31.5, 34.4667],
  'west bank': [31.9522, 35.2332],
  rafah: [31.2969, 34.2484],
  negev: [30.8553, 34.9948],
  golan: [33.0, 35.8],
  iran: [32.4279, 53.688],
  tehran: [35.6892, 51.389],
  isfahan: [32.6539, 51.666],
  natanz: [33.7215, 51.7227],
  fordow: [34.8847, 50.9992],
  bushehr: [28.9684, 50.8385],
  kharg: [29.2487, 50.3251],
  tabriz: [38.08, 46.2919],
  mashhad: [36.2605, 59.6168],
  shiraz: [29.5917, 52.5836],
  lebanon: [33.8547, 35.8623],
  beirut: [33.8938, 35.5018],
  syria: [34.8021, 38.9968],
  damascus: [33.5138, 36.2765],
  jordan: [30.5852, 36.2384],
  iraq: [33.2232, 43.6793],
  baghdad: [33.3152, 44.3661],
  yemen: [15.5527, 48.5164],
  sanaa: [15.3694, 44.191],
  houthi: [15.3694, 44.191],
  'red sea': [20.0, 38.0],
  kizildeniz: [20.0, 38.0],
  hormuz: [26.5, 56.25],
  gulf: [26.0, 50.55],
  saudi: [23.8859, 45.0792],
  riyadh: [24.6877, 46.7219],
  qatar: [25.3548, 51.1839],
  doha: [25.2854, 51.531],
  turkey: [38.9637, 35.2433],
  ankara: [39.9334, 32.8597],
  egypt: [26.8206, 30.8025],
  cairo: [30.0444, 31.2357],
  suez: [29.9668, 32.5498],
  cyprus: [35.1264, 33.4299],
  pakistan: [30.3753, 69.3451],
  'bab el-mandeb': [12.5833, 43.3333],
  mandeb: [12.5833, 43.3333],
  tartus: [34.8959, 35.8866],
  latakia: [35.5317, 35.7909],
  eilat: [29.5581, 34.9482],
  ashdod: [31.8044, 34.6553],
  hebron: [31.5326, 35.0998],
  jenin: [32.4597, 35.3009],
  nablus: [32.2211, 35.2544],
  ramallah: [31.9038, 35.2034],
  bethlehem: [31.7054, 35.2024],
  tulkarm: [32.3104, 35.0286],
  'khan younis': [31.3462, 34.3063],
  hamas: [31.5, 34.4667],
  hezbollah: [33.2721, 35.2033],
  sidon: [33.5571, 35.3729],
  aleppo: [36.2021, 37.1343],
  homs: [34.7324, 36.7137],
  idlib: [35.9306, 36.6339],
  mosul: [36.34, 43.13],
  erbil: [36.1911, 44.0092],
  kirkuk: [35.4681, 44.3922],
  basra: [30.5085, 47.7804],
  aden: [12.7855, 45.0187],
  hodeidah: [14.7978, 42.9545],
  marib: [15.4543, 45.3263],
  bahrain: [26.0667, 50.5577],
  kuwait: [29.3759, 47.9774],
  uae: [24.4539, 54.3773],
  emirates: [24.4539, 54.3773],
  'abu dhabi': [24.4539, 54.3773],
  dubai: [25.2048, 55.2708],
  oman: [21.4735, 55.9754],
  muscat: [23.588, 58.3829],
  qom: [34.6416, 50.8746],
  kermanshah: [34.3142, 47.065],
  ahvaz: [31.3183, 48.6706],
  'bandar abbas': [27.1832, 56.2666],
  chabahar: [25.2919, 60.643],
  'sistan': [29.4963, 60.8629],
  baluch: [29.4963, 60.8629],
  dimona: [31.0700, 35.0300]
};

// Country and actor names are the coarsest answer; a story naming a city is
// placed at the city ("Israeli assault displaces thousands in Hebron").
const COARSE_KEYS = new Set([
  "israel", "iran", "lebanon", "syria", "jordan", "iraq", "yemen", "saudi", "qatar", "turkey",
  "egypt", "cyprus", "pakistan", "bahrain", "kuwait", "uae", "emirates", "oman",
  "hamas", "hezbollah", "houthi", "baluch", "gulf"
]);

// Specific places before coarse ones, then longest key first, so "tel aviv"
// wins over "israel" and "red sea" over "gulf". Each key must start at a word
// boundary: a bare substring test placed "Tirana" in Iran and "woman" in Oman.
// Suffixes stay allowed (Iranian, Israeli, Yemeni). Compiled once at load.
const GEO_ENTRIES: [RegExp, [number, number]][] = Object.entries(GEO_MAP)
  .sort((a, b) => Number(COARSE_KEYS.has(a[0])) - Number(COARSE_KEYS.has(b[0])) || b[0].length - a[0].length)
  .map(([key, coords]) => [new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), coords]);

/**
 * Resolve a place name in `text` to its gazetteer coordinate.
 *
 * Returns the true coordinate. This used to add ±0.6° of random jitter, which
 * displaced pins by up to ~66km, made ingestion non-deterministic, and was
 * compounded by a second randomisation pass in rss.service. Visual de-overlap
 * belongs in the map layer, not in the stored record.
 *
 * "Where" only: whether the story is about the conflict is decided separately
 * (services/relevance.service.ts).
 */
export function extractGeoFromText(text: string): [number, number] | null {
  for (const [pattern, coords] of GEO_ENTRIES) {
    if (pattern.test(text)) {
      return [coords[0], coords[1]];
    }
  }
  return null;
}
