import type { Workspace } from '../types';

/** Map theatres. One list: the store and the map panel both read it. */
export const WORKSPACES: Workspace[] = [
  // İsrail (34°D) ile Tahran/Hürmüz (51–56°D) aynı kadrajda: z5'te ~870 px ≈ 38° boylam.
  { id: 'iran-israel', name: 'İran–İsrail', center: [31.0, 44.5], zoom: 5 },
  { id: 'red-sea', name: 'Kızıldeniz', center: [18.0, 43.0], zoom: 6 },
  { id: 'syria', name: 'Suriye', center: [35.0, 38.5], zoom: 7 }
];
