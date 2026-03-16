import { create } from 'zustand';
import type { Pin, Workspace } from '../types';

export interface NewsPin {
  id: number;
  lat: number;
  lng: number;
  title: string;
  source: string;
  pubDate: string;
  aiSummary?: string;
  category: string;
  link: string;
  reliabilityScore?: number;
  confidenceLabel?: 'Düşük' | 'Orta' | 'Yüksek';
  reliabilitySignals?: string[];
  insufficientData?: boolean;
}

const WORKSPACES: Workspace[] = [
  { id: 'iran-israel', name: 'İRAN·İSRAİL', center: [32.0, 36.5], zoom: 6 },
  { id: 'red-sea', name: 'KIZILDENİZ', center: [18.0, 43.0], zoom: 6 },
  { id: 'syria', name: 'SURİYE', center: [35.0, 38.5], zoom: 7 }
];

interface MapStoreState {
  pins: Pin[];
  newsPins: NewsPin[];
  selectedPin: Pin | null;
  pinDrawerOpen: boolean;
  editingPin: Pin | null;
  mapCenter: [number, number];
  zoom: number;
  activeWorkspace: string;
  setPins: (pins: Pin[]) => void;
  addPin: (pin: Pin) => void;
  updatePinLocal: (pin: Pin) => void;
  deletePinLocal: (id: number) => void;
  deletePin: (id: number) => Promise<void>;
  updatePin: (id: number, data: Partial<Pin>) => Promise<void>;
  openDrawer: () => void;
  openEditDrawer: (pin: Pin) => void;
  closeDrawer: () => void;
  closeEditDrawer: () => void;
  setSelectedPin: (pin: Pin | null) => void;
  setMapView: (center: [number, number], zoom: number) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  fetchNewsPins: () => Promise<void>;
  addNewsPin: (pin: NewsPin) => void;
  legendFilters: string[];
  hoveredLegendKey: string | null;
  toggleLegendFilter: (key: string) => void;
  clearLegendFilters: () => void;
  setHoveredLegendKey: (key: string | null) => void;
}

export const useMapStore = create<MapStoreState>((set) => ({
  pins: [],
  newsPins: [],
  selectedPin: null,
  pinDrawerOpen: false,
  editingPin: null,
  mapCenter: [32.0, 36.5],
  zoom: 6,
  activeWorkspace: 'iran-israel',
  legendFilters: [],
  hoveredLegendKey: null,
  setPins: (pins) => set({ pins }),
  addPin: (pin) => {
    set((state) => ({ pins: [pin, ...state.pins] }));
  },
  updatePinLocal: (pin) => {
    set((state) => ({
      pins: state.pins.map((currentPin) => (currentPin.id === pin.id ? pin : currentPin)),
      selectedPin: state.selectedPin?.id === pin.id ? pin : state.selectedPin,
      editingPin: state.editingPin?.id === pin.id ? pin : state.editingPin
    }));
  },
  deletePinLocal: (id) => {
    set((state) => ({
      pins: state.pins.filter((pin) => pin.id !== id),
      selectedPin: state.selectedPin?.id === id ? null : state.selectedPin,
      editingPin: state.editingPin?.id === id ? null : state.editingPin,
      pinDrawerOpen: state.editingPin?.id === id ? false : state.pinDrawerOpen
    }));
  },
  deletePin: async (id) => {
    const response = await fetch(`/api/pins/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Pin silinemedi');
    }
    set((state) => ({
      pins: state.pins.filter((pin) => pin.id !== id),
      selectedPin: state.selectedPin?.id === id ? null : state.selectedPin,
      editingPin: state.editingPin?.id === id ? null : state.editingPin,
      pinDrawerOpen: state.editingPin?.id === id ? false : state.pinDrawerOpen
    }));
  },
  updatePin: async (id, data) => {
    const response = await fetch(`/api/pins/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error('Pin guncellenemedi');
    }
    set((state) => ({
      pins: state.pins.map((pin) => (pin.id === id ? { ...pin, ...data } : pin)),
      selectedPin: state.selectedPin?.id === id ? { ...state.selectedPin, ...data } : state.selectedPin,
      editingPin: state.editingPin?.id === id ? { ...state.editingPin, ...data } : state.editingPin
    }));
  },
  openDrawer: () => {
    set({ pinDrawerOpen: true, editingPin: null, selectedPin: null });
  },
  openEditDrawer: (pin) => {
    set({ pinDrawerOpen: true, editingPin: pin, selectedPin: pin });
  },
  closeDrawer: () => {
    set({ pinDrawerOpen: false, editingPin: null });
  },
  closeEditDrawer: () => {
    set({ pinDrawerOpen: false, editingPin: null });
  },
  setSelectedPin: (pin) => set({ selectedPin: pin }),
  setMapView: (center, zoom) => set({ mapCenter: center, zoom }),
  setActiveWorkspace: (workspaceId) => {
    const ws = WORKSPACES.find((w) => w.id === workspaceId);
    if (ws) set({ activeWorkspace: workspaceId, mapCenter: ws.center, zoom: ws.zoom });
  },
  fetchNewsPins: async () => {
    try {
      const pins = await fetch('/api/feed/map-pins').then((r) => r.json());
      if (Array.isArray(pins)) {
        set({ newsPins: pins });
      }
    } catch {
      set({ newsPins: [] });
    }
  },
  addNewsPin: (pin) => {
    set((state) => {
      const existing = state.newsPins.find((p) => p.id === pin.id);
      if (existing) return state;
      return { newsPins: [pin, ...state.newsPins].slice(0, 30) };
    });
  },
  toggleLegendFilter: (key) => {
    set((state) => ({
      legendFilters: state.legendFilters.includes(key)
        ? state.legendFilters.filter((item) => item !== key)
        : [...state.legendFilters, key]
    }));
  },
  clearLegendFilters: () => set({ legendFilters: [] }),
  setHoveredLegendKey: (key) => set({ hoveredLegendKey: key })
}));
