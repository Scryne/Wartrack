import type { Workspace } from '../types';

/** Map theatres. One list: the store and the map panel both read it. */
export const WORKSPACES: Workspace[] = [
  { id: 'iran-israel', name: 'İran–İsrail', center: [32.0, 36.5], zoom: 6 },
  { id: 'red-sea', name: 'Kızıldeniz', center: [18.0, 43.0], zoom: 6 },
  { id: 'syria', name: 'Suriye', center: [35.0, 38.5], zoom: 7 }
];
