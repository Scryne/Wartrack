import type { Workspace } from '../types';

/**
 * Map theatres. One list: the store and the map panel both read it.
 * `bounds` decides what the map shows: the map fits it at any panel width. `center`/`zoom` are only
 * the first paint before the fit (and the store's starting values). A fixed centre+zoom left Israel
 * off the left edge on a 390 px phone.
 */
export const WORKSPACES: Workspace[] = [
  // İsrail (34°D) ile Tahran/Hürmüz (51–56°D) aynı kadrajda.
  { id: 'iran-israel', name: 'İran–İsrail', center: [31.0, 44.5], zoom: 5, bounds: [[25.5, 33.8], [37.0, 56.8]] },
  // Güney Kızıldeniz, Bab el-Mendeb ve Yemen kıyısı.
  { id: 'red-sea', name: 'Kızıldeniz', center: [18.0, 43.0], zoom: 6, bounds: [[12.0, 38.0], [22.5, 48.0]] },
  { id: 'syria', name: 'Suriye', center: [35.0, 38.5], zoom: 7, bounds: [[32.3, 35.6], [37.4, 42.4]] }
];
