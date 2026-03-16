import { create } from "zustand";
import type { Event } from "../types";

// API calls go through vite proxy

export interface DashboardStats {
  articles: number;
  events: number;
  pins: number;
  summaries: number;
}

interface EventStoreState {
  events: Event[];
  unreadCount: number;
  threatLevel: 1 | 2 | 3 | 4 | 5;
  stats: DashboardStats;
  loading: boolean;

  fetchEvents: () => Promise<void>;
  fetchStats: () => Promise<void>;
  addEvent: (event: Event) => void;
  markAllRead: () => void;
  setThreatLevel: (level: 1 | 2 | 3 | 4 | 5) => void;
  computeThreatLevel: () => void;
  clearAll: () => void;
}

function calcThreatLevel(events: Event[]): 1 | 2 | 3 | 4 | 5 {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const highSevCount = events.filter(
    (e) => Number(e.severity) >= 4 && e.createdAt > oneHourAgo
  ).length;

  if (highSevCount === 0) return 1;
  if (highSevCount <= 2) return 2;
  if (highSevCount <= 5) return 3;
  if (highSevCount <= 10) return 4;
  return 5;
}

export const useEventStore = create<EventStoreState>((set, get) => ({
  events: [],
  unreadCount: 0,
  threatLevel: 1,
  stats: { articles: 0, events: 0, pins: 0, summaries: 0 },
  loading: false,

  fetchEvents: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/events?limit=100&minSeverity=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const events = (json.data ?? []) as Event[];
      set({ events, loading: false });
      get().computeThreatLevel();
    } catch {
      set({ loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch(`/api/events/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stats = (await res.json()) as DashboardStats;
      set({ stats });
    } catch {
      // silently fail
    }
  },

  addEvent: (event) => {
    if (Number(event.severity) < 3) {
      return;
    }
    set((state) => ({
      events: [event, ...state.events],
      unreadCount: state.unreadCount + 1,
    }));
    get().computeThreatLevel();
  },

  markAllRead: () => {
    set({ unreadCount: 0 });
  },

  setThreatLevel: (level) => {
    set({ threatLevel: level });
  },

  computeThreatLevel: () => {
    const level = calcThreatLevel(get().events);
    set({ threatLevel: level });
  },

  clearAll: () => {
    set({ events: [], unreadCount: 0, threatLevel: 1 });
  },
}));
