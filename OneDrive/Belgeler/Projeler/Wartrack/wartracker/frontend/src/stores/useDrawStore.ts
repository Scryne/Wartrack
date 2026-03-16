import { create } from 'zustand';

export type DrawTool = 'none' | 'pen' | 'line' | 'circle' | 'rectangle';

export interface DrawShape {
  id: string;
  tool: DrawTool;
  color: string;
  points: [number, number][];
  radius?: number;
  label?: string;
}

interface DrawState {
  active: boolean;
  tool: DrawTool;
  color: string;
  shapes: DrawShape[];
  toggle: () => void;
  setTool: (t: DrawTool) => void;
  setColor: (c: string) => void;
  addShape: (s: DrawShape) => void;
  removeShape: (id: string) => void;
  clearAll: () => void;
}

export const useDrawStore = create<DrawState>((set) => ({
  active: false,
  tool: 'none',
  color: '#FF3B3B',
  shapes: [],
  toggle: () => set((s) => ({ active: !s.active, tool: s.active ? 'none' : 'pen' })),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  addShape: (shape) => set((s) => ({ shapes: [...s.shapes, shape] })),
  removeShape: (id) => set((s) => ({ shapes: s.shapes.filter((sh) => sh.id !== id) })),
  clearAll: () => set({ shapes: [] })
}));
