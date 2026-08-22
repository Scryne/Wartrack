import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch } from '../lib/api';

const RSS_INTERVALS = [5, 10, 15, 30] as const;
type RssInterval = (typeof RSS_INTERVALS)[number];

interface SettingsState {
  open: boolean;
  rssInterval: RssInterval;
  autoSummarize: boolean;
  aiModel: 'ollama' | 'gemini';
  threatSound: boolean;
  setOpen: (v: boolean) => void;
  update: (partial: Partial<SettingsState>) => void;
  /** Pull server state into the store. */
  hydrate: () => Promise<void>;
  /** Apply a settings:updated socket payload. */
  applyServerSettings: (settings: Record<string, unknown>) => void;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/** Map the server's dotted keys onto this store's shape. Unknown keys ignored. */
function mapServerSettings(
  settings: Record<string, unknown>,
  current: SettingsState
): Partial<SettingsState> {
  const next: Partial<SettingsState> = {};

  if ('rss.interval' in settings) {
    const parsed = Number(settings['rss.interval']);
    if ((RSS_INTERVALS as readonly number[]).includes(parsed)) {
      next.rssInterval = parsed as RssInterval;
    }
  }
  if ('ai.model' in settings) {
    const model = String(settings['ai.model']).toLowerCase();
    if (model === 'ollama' || model === 'gemini') next.aiModel = model;
  }
  if ('ai.autoSummarize' in settings) {
    next.autoSummarize = toBoolean(settings['ai.autoSummarize'], current.autoSummarize);
  }
  if ('threat.sound' in settings) {
    next.threatSound = toBoolean(settings['threat.sound'], current.threatSound);
  }

  return next;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      open: false,
      rssInterval: 5,
      autoSummarize: true,
      aiModel: 'ollama',
      threatSound: false,
      setOpen: (open) => set({ open }),
      update: (partial) => set(partial),

      // Without this the store was a second, never-reconciled source of truth:
      // a fresh browser showed hardcoded defaults regardless of what the server
      // was actually running, and two browsers could silently disagree.
      hydrate: async () => {
        try {
          const res = await apiFetch('/api/settings');
          if (!res.ok) return;
          const settings = (await res.json()) as Record<string, unknown>;
          if (settings && typeof settings === 'object') {
            set(mapServerSettings(settings, get()));
          }
        } catch {
          // Offline or backend down: keep the persisted local values.
        }
      },

      applyServerSettings: (settings) => {
        if (!settings || typeof settings !== 'object') return;
        set(mapServerSettings(settings, get()));
      }
    }),
    {
      name: 'wartracker-settings',
      // `open` is transient UI state. Persisting it meant closing the tab with
      // the settings modal open reopened it on the next load.
      partialize: (state) => ({
        rssInterval: state.rssInterval,
        autoSummarize: state.autoSummarize,
        aiModel: state.aiModel,
        threatSound: state.threatSound
      })
    }
  )
);
