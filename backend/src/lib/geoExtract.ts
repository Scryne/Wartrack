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
  strait: [26.5, 56.25],
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
  dimona: [31.0700, 35.0300]
};

// Longest key first, so "tel aviv" wins over "israel" and "red sea" over "gulf".
// Sorted once at module load rather than on every call.
const GEO_ENTRIES = Object.entries(GEO_MAP).sort((a, b) => b[0].length - a[0].length);

/**
 * Resolve a place name in `text` to its gazetteer coordinate.
 *
 * Returns the true coordinate. This used to add ±0.6° of random jitter, which
 * displaced pins by up to ~66km, made ingestion non-deterministic, and was
 * compounded by a second randomisation pass in rss.service. Visual de-overlap
 * belongs in the map layer, not in the stored record.
 */
export function extractGeoFromText(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const [key, coords] of GEO_ENTRIES) {
    if (lower.includes(key)) {
      return [coords[0], coords[1]];
    }
  }
  return null;
}
