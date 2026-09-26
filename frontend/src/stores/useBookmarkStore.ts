import { create } from 'zustand';
import type { Article } from '../types';
import { apiFetch } from '../lib/api';

interface BookmarkState {
  ids: Set<number>;
  articles: Article[];
  toggle: (articleId: number) => Promise<void>;
  isBookmarked: (id: number) => boolean;
  fetchBookmarks: () => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  ids: new Set<number>(),
  articles: [],

  isBookmarked: (id) => get().ids.has(id),

  fetchBookmarks: async () => {
    try {
      const articles = await apiFetch('/api/bookmarks').then((r) => r.json() as Promise<Article[]>);
      set({
        articles,
        ids: new Set(articles.map((article) => article.id))
      });
    } catch {
      set({ articles: [], ids: new Set<number>() });
    }
  },

  toggle: async (articleId) => {
    const saved = get().ids.has(articleId);
    const method = saved ? 'DELETE' : 'POST';
    // A path, not an absolute URL: apiFetch resolves it via apiUrl internally.
    const path = saved ? `/api/bookmarks/${articleId}` : '/api/bookmarks';
    const init = saved
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId })
        };

    const res = await apiFetch(path, init);
    if (!res.ok) {
      throw new Error('Kaydetme isteği başarısız');
    }

    await get().fetchBookmarks();
  }
}));
