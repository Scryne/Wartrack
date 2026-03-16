import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  open: boolean;
  rssInterval: 5 | 10 | 15 | 30;
  autoSummarize: boolean;
  aiModel: 'ollama' | 'gemini';
  threatSound: boolean;
  setOpen: (v: boolean) => void;
  update: (partial: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      open: false,
      rssInterval: 5,
      autoSummarize: true,
      aiModel: 'ollama',
      threatSound: false,
      setOpen: (open) => set({ open }),
      update: (partial) => set(partial)
    }),
    { name: 'wartracker-settings' }
  )
);
