import { create } from "zustand";
import type { Article } from "../types";
import { useWatchlistStore } from "./useWatchlistStore";

// API calls go through vite proxy (/api → localhost:3001)
const PAGE_SIZE = 50;

type FeedTab = "all" | "haber" | "bölge" | "savunma" | "analiz" | "bookmarks";

interface FeedStoreState {
  articles: Article[];
  loading: boolean;
  error: string | null;
  activeTab: FeedTab;
  searchQuery: string;
  selectedSource: string | null;
  page: number;
  total: number;
  hasMore: boolean;
  lastUpdated: Date | null;
  refreshing: boolean;

  fetchArticles: () => Promise<void>;
  loadMore: () => Promise<void>;
  setTab: (tab: FeedTab) => void;
  setSearch: (query: string) => void;
  setSource: (source: string | null) => void;
  refresh: () => Promise<void>;
  prependArticle: (article: Article) => void;
  updateArticleSummary: (id: number, aiSummary: string) => void;
  filteredArticles: () => Article[];
}

export const useFeedStore = create<FeedStoreState>((set, get) => ({
  articles: [],
  loading: false,
  error: null,
  activeTab: "all",
  searchQuery: "",
  selectedSource: null,
  page: 0,
  total: 0,
  hasMore: true,
  lastUpdated: null,
  refreshing: false,

  fetchArticles: async () => {
    const { activeTab, searchQuery, selectedSource } = get();
    set({ loading: true, error: null, page: 0 });

    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", "0");
      if (activeTab !== "all" && activeTab !== "bookmarks") params.set("category", activeTab);
      if (searchQuery) params.set("search", searchQuery);
      if (selectedSource) params.set("source", selectedSource);

      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      set({
        articles: json.data ?? [],
        total: json.total ?? 0,
        hasMore: (json.data?.length ?? 0) >= PAGE_SIZE,
        loading: false,
        lastUpdated: new Date(),
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
        loading: false,
      });
    }
  },

  loadMore: async () => {
    const { activeTab, searchQuery, selectedSource, page, articles, loading, hasMore } = get();
    if (loading || !hasMore) return;

    const nextPage = page + 1;
    const offset = nextPage * PAGE_SIZE;
    set({ loading: true });

    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      if (activeTab !== "all" && activeTab !== "bookmarks") params.set("category", activeTab);
      if (searchQuery) params.set("search", searchQuery);
      if (selectedSource) params.set("source", selectedSource);

      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const newArticles = json.data ?? [];

      set({
        articles: [...articles, ...newArticles],
        page: nextPage,
        total: json.total ?? 0,
        hasMore: newArticles.length >= PAGE_SIZE,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
        loading: false,
      });
    }
  },

  setTab: (tab) => {
    if (tab === "bookmarks") {
      set({ activeTab: tab });
      return;
    }
    set({ activeTab: tab, articles: [], page: 0, hasMore: true });
    get().fetchArticles();
  },

  setSearch: (query) => {
    if (get().activeTab === "bookmarks") {
      set({ searchQuery: query });
      return;
    }
    set({ searchQuery: query, articles: [], page: 0, hasMore: true });
    get().fetchArticles();
  },

  setSource: (source) => {
    set({ selectedSource: source, articles: [], page: 0, hasMore: true });
    get().fetchArticles();
  },

  refresh: async () => {
    set({ refreshing: true });
    try {
      const res = await fetch(`/api/feed/refresh`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await get().fetchArticles();
    } catch {
      // Refresh failed silently — fetchArticles will still reload the list
    } finally {
      set({ refreshing: false });
    }
  },

  prependArticle: (article) => {
    set((state) => {
      // Avoid duplicate
      if (state.articles.some((a) => a.id === article.id || a.guid === article.guid)) {
        return state;
      }
      return {
        articles: [article, ...state.articles],
        total: state.total + 1,
      };
    });
  },

  updateArticleSummary: (id, aiSummary) => {
    set((state) => ({
      articles: state.articles.map((a) =>
        a.id === id ? { ...a, aiSummary } : a
      ),
    }));
  },

  filteredArticles: () => {
    const { articles } = get();
    const { matches } = useWatchlistStore.getState();
    const watched = articles.filter((a) => matches(a.title).length > 0);
    const unwatched = articles.filter((a) => matches(a.title).length === 0);
    return [...watched, ...unwatched];
  }
}));
