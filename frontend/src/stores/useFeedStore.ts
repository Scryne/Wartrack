import { create } from "zustand";
import type { Article } from "../types";
import { useWatchlistStore } from "./useWatchlistStore";
import { apiFetch } from "../lib/api";

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
  /** Only articles placed in the monitored region (see GetArticlesOpts.scope). */
  theatreOnly: boolean;

  fetchArticles: () => Promise<void>;
  loadMore: () => Promise<void>;
  setTab: (tab: FeedTab) => void;
  setSearch: (query: string) => void;
  setSource: (source: string | null) => void;
  setTheatreOnly: (value: boolean) => void;
  refresh: () => Promise<void>;
  prependArticle: (article: Article) => void;
  updateArticleSummary: (id: number, aiSummary: string) => void;
  filteredArticles: () => Article[];
}

function feedParams(state: Pick<FeedStoreState, "activeTab" | "searchQuery" | "selectedSource" | "theatreOnly">, offset: number) {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (state.activeTab !== "all" && state.activeTab !== "bookmarks") params.set("category", state.activeTab);
  if (state.searchQuery) params.set("search", state.searchQuery);
  if (state.selectedSource) params.set("source", state.selectedSource);
  if (state.theatreOnly) params.set("scope", "theatre");
  return params;
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
  theatreOnly: true,

  fetchArticles: async () => {
    set({ loading: true, error: null, page: 0 });

    try {
      const params = feedParams(get(), 0);
      const res = await apiFetch(`/api/feed?${params}`);
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
    const { page, articles, loading, hasMore } = get();
    if (loading || !hasMore) return;

    const nextPage = page + 1;
    const offset = nextPage * PAGE_SIZE;
    set({ loading: true });

    try {
      const params = feedParams(get(), offset);
      const res = await apiFetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const newArticles: Article[] = json.data ?? [];

      // Realtime prepends shift the server-side offset window, so a page can
      // legitimately contain rows already on screen. Dedupe on append the same
      // way prependArticle does, otherwise those render with duplicate keys.
      const seen = new Set(articles.map((a) => a.id));
      const deduped = newArticles.filter((a) => !seen.has(a.id));

      set({
        articles: [...articles, ...deduped],
        page: nextPage,
        total: json.total ?? 0,
        // Based on the server page size, not the deduped length: a full page
        // that happened to be entirely duplicates still means more remain.
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

  // `void`, not a bare call: these are deliberately fire-and-forget. The
  // setter returns immediately so the tab switch feels instant, and
  // fetchArticles() reports its own failures into `error` rather than
  // rejecting. Marking that explicitly keeps the floating-promise rule useful
  // — an unmarked one here would be a genuine unhandled rejection.
  setTab: (tab) => {
    if (tab === "bookmarks") {
      set({ activeTab: tab });
      return;
    }
    set({ activeTab: tab, articles: [], page: 0, hasMore: true });
    void get().fetchArticles();
  },

  setSearch: (query) => {
    if (get().activeTab === "bookmarks") {
      set({ searchQuery: query });
      return;
    }
    set({ searchQuery: query, articles: [], page: 0, hasMore: true });
    void get().fetchArticles();
  },

  setSource: (source) => {
    set({ selectedSource: source, articles: [], page: 0, hasMore: true });
    void get().fetchArticles();
  },

  setTheatreOnly: (value) => {
    set({ theatreOnly: value, articles: [], page: 0, hasMore: true });
    void get().fetchArticles();
  },

  refresh: async () => {
    set({ refreshing: true });
    try {
      const res = await apiFetch(`/api/feed/refresh`, { method: "POST" });
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
      // Live pushes bypass the query, so the region filter is applied here too.
      if (state.theatreOnly && (article.lat == null || article.lng == null)) {
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
