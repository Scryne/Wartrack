import { create } from "zustand";

/**
 * Why the live stream is down matters to the operator: a missing or wrong key
 * is fixed in Settings, a dead server is not. Both used to read "BAĞLANTI YOK".
 */
export type ConnectionProblem = "none" | "offline" | "unauthorized";

interface State {
  connected: boolean;
  problem: ConnectionProblem;
  setConnected: (v: boolean) => void;
  setProblem: (p: ConnectionProblem) => void;
}

export const useConnectionStore = create<State>((set) => ({
  connected: false,
  problem: "none",
  setConnected: (connected) => set(connected ? { connected, problem: "none" } : { connected }),
  setProblem: (problem) => set({ problem })
}));
