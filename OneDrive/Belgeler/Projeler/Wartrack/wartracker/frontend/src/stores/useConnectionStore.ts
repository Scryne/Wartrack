import { create } from "zustand";

interface State {
  connected: boolean;
  setConnected: (v: boolean) => void;
}

export const useConnectionStore = create<State>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected })
}));
