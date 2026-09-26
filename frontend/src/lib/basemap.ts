/**
 * Map tiles.
 *
 * CARTO's dark_all basemap was used until 2026-09; CARTO now answers keyless
 * requests with an "API KEY REQUIRED" placeholder tile, which left the map
 * blank. Esri's World Dark Gray canvas needs no key and keeps the same muted
 * surface, so event markers stay the brightest thing on the map. Labels come
 * from a separate reference layer drawn above the base.
 *
 * Any XYZ provider can be swapped in through VITE_MAP_TILE_URL (and optionally
 * VITE_MAP_LABELS_URL, VITE_MAP_ATTRIBUTION); providers require their
 * attribution to stay visible, so set it together with the URL.
 */
const env = import.meta.env;

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';

export const BASEMAP = {
  tileUrl: env.VITE_MAP_TILE_URL || `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  labelsUrl: env.VITE_MAP_TILE_URL ? env.VITE_MAP_LABELS_URL || null : `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  attribution: env.VITE_MAP_ATTRIBUTION || 'Esri, HERE, Garmin, © OpenStreetMap',
  maxNativeZoom: 16
} as const;
