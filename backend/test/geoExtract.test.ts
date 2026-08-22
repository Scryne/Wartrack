import { extractGeoFromText } from "../src/lib/geoExtract";

/** D6: coordinates must be the true gazetteer value, not randomised. */
describe("extractGeoFromText", () => {
  it("returns the exact gazetteer coordinate, with no jitter", () => {
    // Natanz: [33.7215, 51.7227] in GEO_MAP.
    expect(extractGeoFromText("Strike reported near Natanz facility")).toEqual([
      33.7215, 51.7227
    ]);
  });

  it("is deterministic across repeated calls", () => {
    const text = "Explosion reported in Tehran";
    const results = Array.from({ length: 20 }, () => extractGeoFromText(text));

    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("prefers the longest matching key", () => {
    // "tel aviv" (8 chars) must beat "israel" (6) when both appear.
    expect(extractGeoFromText("Israel: sirens over Tel Aviv")).toEqual([32.0853, 34.7818]);
  });

  it("is case-insensitive", () => {
    expect(extractGeoFromText("BEIRUT blast")).toEqual(extractGeoFromText("beirut blast"));
  });

  it("returns null when nothing matches", () => {
    expect(extractGeoFromText("Local council approves budget")).toBeNull();
  });

  it("resolves maritime choke points and strategic regional locations", () => {
    expect(extractGeoFromText("Vessel attacked in Bab el-Mandeb strait")).toEqual([12.5833, 43.3333]);
    expect(extractGeoFromText("Naval facility activity near Tartus")).toEqual([34.8959, 35.8866]);
    expect(extractGeoFromText("Facility status report from Dimona")).toEqual([31.0700, 35.0300]);
  });
});
