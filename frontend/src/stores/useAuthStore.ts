import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The shared secret sent as X-API-Key on mutating requests.
 *
 * Deliberately a separate store from useSettingsStore, for two reasons:
 *
 *  1. useSettingsStore pushes its contents to PUT /api/settings and hydrates
 *     from GET /api/settings. The secret must never travel that path and be
 *     stored server-side as a plaintext row. Keeping it in its own store makes
 *     that impossible by construction rather than by remembering to exclude it.
 *  2. lib/api reads this store, and useSettingsStore imports lib/api — putting
 *     the key there would create an import cycle.
 *
 * localStorage is readable by any script on this origin. That is the same
 * exposure model as the rest of this dashboard's persisted state and is
 * appropriate for a single-operator tool; it is not suitable for a secret
 * shared between mutually distrusting users.
 */
interface AuthState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  hasApiKey: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      setApiKey: (key) => set({ apiKey: key.trim() }),
      clearApiKey: () => set({ apiKey: '' }),
      hasApiKey: () => get().apiKey.trim().length > 0
    }),
    {
      name: 'wartracker-auth',
      partialize: (state) => ({ apiKey: state.apiKey })
    }
  )
);
