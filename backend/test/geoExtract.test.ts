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
  it("matches place names at a word boundary, not inside other words", () => {
    expect(extractGeoFromText("Albania: protest in Tirana")).toBeNull();
    expect(extractGeoFromText("A woman was honoured at the ceremony")).toBeNull();
    expect(extractGeoFromText("Iranian drones over the strait")).toEqual([32.4279, 53.688]);
    expect(extractGeoFromText("Omani mediators arrive")).toEqual([21.4735, 55.9754]);
  });

  it("no longer maps any strait to Hormuz", () => {
    expect(extractGeoFromText("Warships transit the Taiwan Strait")).toBeNull();
    expect(extractGeoFromText("Tanker seized in the Strait of Hormuz")).toEqual([26.5, 56.25]);
  });

  it("knows West Bank and Gulf places the feeds actually name", () => {
    expect(extractGeoFromText("Israeli assault displaces thousands in Hebron")).toEqual([31.5326, 35.0998]);
    expect(extractGeoFromText("Drone strike near Hodeidah port")).toEqual([14.7978, 42.9545]);
  });
});
