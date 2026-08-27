import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayerState {
  nuclear: boolean;
  sam: boolean;
  heatmap: boolean;
  rangeRings: boolean;
  toggle: (layer: 'nuclear' | 'sam' | 'heatmap' | 'rangeRings') => void;
}

export const useLayerStore = create<LayerState>()(
  persist(
    (set) => ({
      nuclear: false,
      sam: false,
      heatmap: false,
      rangeRings: false,
      toggle: (layer) => set((s) => ({ [layer]: !s[layer] }))
    }),
    { name: 'wt-layers' }
  )
);
