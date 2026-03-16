import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayerState {
  nuclear: boolean;
  sam: boolean;
  toggle: (layer: 'nuclear' | 'sam') => void;
}

export const useLayerStore = create<LayerState>()(
  persist(
    (set) => ({
      nuclear: false,
      sam: false,
      toggle: (layer) => set((s) => ({ [layer]: !s[layer] }))
    }),
    { name: 'wt-layers' }
  )
);
