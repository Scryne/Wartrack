import { create } from "zustand";
import type { Event } from "../types";
import { apiFetch } from "../lib/api";

export interface DashboardStats {
  articles: number;
  events: number;
  pins: number;
  summaries: number;
}

export type ThreatLevel = 1 | 2 | 3 | 4 | 5;

/** Mirrors backend ExplainableThreatAnalysis (services/threat.service.ts). */
export interface ThreatAnalysis {
  threatLevel: ThreatLevel;
  threatLabel: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  drivers: { factor: string; weight: number; description: string }[];
  metrics: {
    criticalEventsLast1h: number;
    criticalEventsLast24h: number;
    totalEventsLast24h: number;
    recent6hCount: number;
    prior6hCount: number;
    activeHotspotsCount: number;
    corroboratedClustersCount: number;
  };
  temporalTrend: "ESCALATING" | "STABLE" | "DE-ESCALATING";
  calculatedAt: string;
}

interface EventStoreState {
  events: Event[];
  unreadCount: number;
  threatLevel: ThreatLevel;
  /**
   * The server's explainable analysis is the only source of the threat level.
   * The client used to derive its own level from whatever events happened to
   * be loaded, which was none until the events tab was opened: the header
   * read 5 while the panel under it counted 0 critical events.
   */
  threat: ThreatAnalysis | null;
  stats: DashboardStats;
  loading: boolean;

  fetchEvents: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchThreat: () => Promise<void>;
  addEvent: (event: Event) => void;
  markAllRead: () => void;
  setThreatLevel: (level: ThreatLevel) => void;
  clearAll: () => void;
}

/** Coalesces bursts of live events into one re-analysis. */
const THREAT_REFRESH_DEBOUNCE_MS = 1_500;
let threatRefreshTimer: ReturnType<typeof setTimeout> | null = null;

export const useEventStore = create<EventStoreState>((set, get) => ({
  events: [],
  unreadCount: 0,
  threatLevel: 1,
  threat: null,
  stats: { articles: 0, events: 0, pins: 0, summaries: 0 },
  loading: false,

  fetchEvents: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch(`/api/events?limit=100&minSeverity=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const events = (json.data ?? []) as Event[];
      set({ events, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await apiFetch(`/api/events/stats`);
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
    if (threatRefreshTimer) clearTimeout(threatRefreshTimer);
    threatRefreshTimer = setTimeout(() => {
      threatRefreshTimer = null;
      void get().fetchThreat();
    }, THREAT_REFRESH_DEBOUNCE_MS);
  },

  fetchThreat: async () => {
    try {
      const res = await apiFetch(`/api/events/threat-analysis`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const threat = (await res.json()) as ThreatAnalysis;
      set({ threat, threatLevel: threat.threatLevel });
    } catch {
      // Keep the last known analysis; the panel shows its timestamp, so a
      // stale reading is visible rather than silently replaced by a guess.
    }
  },

  markAllRead: () => {
    set({ unreadCount: 0 });
  },

  setThreatLevel: (level) => {
    set({ threatLevel: level });
  },

  clearAll: () => {
    set({ events: [], unreadCount: 0, threatLevel: 1 });
  },
}));
