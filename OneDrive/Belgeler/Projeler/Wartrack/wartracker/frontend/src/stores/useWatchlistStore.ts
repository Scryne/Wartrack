import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistState {
  keywords: string[];
  addKeyword: (kw: string) => void;
  removeKeyword: (kw: string) => void;
  matches: (text: string) => string[];
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      keywords: [],
      addKeyword: (kw) =>
        set((s) => ({
          keywords: [...new Set([...s.keywords, kw.trim().toLowerCase()])]
        })),
      removeKeyword: (kw) =>
        set((s) => ({
          keywords: s.keywords.filter((k) => k !== kw)
        })),
      matches: (text) => {
        const t = text.toLowerCase();
        return get().keywords.filter((k) => t.includes(k));
      }
    }),
    { name: 'wt-watchlist' }
  )
);
