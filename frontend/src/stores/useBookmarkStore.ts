import { create } from 'zustand';
import type { Article } from '../types';

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
      const articles = await fetch('/api/bookmarks').then((r) => r.json() as Promise<Article[]>);
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
    const url = saved ? `/api/bookmarks/${articleId}` : '/api/bookmarks';
    const init = saved
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId })
        };

    const res = await fetch(url, init);
    if (!res.ok) {
      throw new Error('Bookmark istegi basarisiz');
    }

    await get().fetchBookmarks();
  }
}));
