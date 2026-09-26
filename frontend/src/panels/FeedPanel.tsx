import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Sparkles, Star } from 'lucide-react';
import FeedCard from '../components/FeedCard';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { useFeedStore } from '../stores/useFeedStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';

const TABS = [
  { id: 'all', label: 'Tümü' },
  { id: 'haber', label: 'Haber' },
  { id: 'bölge', label: 'Bölge' },
  { id: 'savunma', label: 'Savunma' },
  { id: 'analiz', label: 'Analiz' },
  { id: 'bookmarks', label: 'Kaydedilenler' }
] as const;
type TabKey = (typeof TABS)[number]['id'];

interface FeedPanelProps {
  onOpenBrief: () => void;
}

function FeedPanel({ onOpenBrief }: FeedPanelProps) {
  const {
    articles,
    loading,
    error,
    activeTab,
    searchQuery,
    total,
    lastUpdated,
    refreshing,
    hasMore,
    theatreOnly,
    fetchArticles,
    setTab,
    setSearch,
    setTheatreOnly,
    refresh,
    loadMore
  } = useFeedStore();
  const bookmarkArticles = useBookmarkStore((s) => s.articles);
  const matches = useWatchlistStore((s) => s.matches);

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const isBookmarksTab = activeTab === 'bookmarks';
  const orderedArticles = useMemo(() => {
    const watched = articles.filter((a) => matches(a.title).length > 0);
    const unwatched = articles.filter((a) => matches(a.title).length === 0);
    return [...watched, ...unwatched];
  }, [articles, matches]);
  const displayArticles = isBookmarksTab ? bookmarkArticles : orderedArticles;
  const articleCount = isBookmarksTab ? bookmarkArticles.length : total;

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== searchQuery) setSearch(localQuery);
    }, 350);
    return () => clearTimeout(t);
  }, [localQuery, searchQuery, setSearch]);

  const updatedText = lastUpdated
    ? lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  const clearSearch = () => {
    setLocalQuery('');
    setSearch('');
  };

  let emptyState: { title: string; body: string; action?: { label: string; run: () => void } } | null = null;
  if (!loading && !error && displayArticles.length === 0) {
    if (isBookmarksTab) {
      emptyState = {
        title: 'Kaydedilmiş haber yok',
        body: 'Bir haberin üzerine gelip yıldıza basarak buraya ekleyin.'
      };
    } else if (searchQuery) {
      emptyState = {
        title: `"${searchQuery}" ile eşleşen haber yok`,
        body: theatreOnly ? 'Arama yalnız bölgeye ait haberlerde yapıldı.' : 'Başka bir sözcükle deneyin.',
        action: { label: 'Aramayı temizle', run: clearSearch }
      };
    } else if (theatreOnly) {
      emptyState = {
        title: 'Bu sekmede bölgeye ait haber yok',
        body: 'Kaynaklar taranıyor; bölge dışı haberler de dahil edilebilir.',
        action: { label: 'Tüm haberleri göster', run: () => setTheatreOnly(false) }
      };
    } else {
      emptyState = {
        title: 'Henüz haber yok',
        body: 'Kaynaklar her 5 dakikada taranır. İlk tarama birkaç dakika sürebilir.',
        action: { label: 'Şimdi tara', run: () => void refresh() }
      };
    }
  }

  return (
    <section className="panel" aria-labelledby="wt-feed-title">
      <div className="panel-header">
        <div className="wt-panel-heading">
          <h2 id="wt-feed-title" className="panel-title">
            Haberler
          </h2>
          <span className="wt-count" aria-label={`${articleCount} haber`}>
            {articleCount}
          </span>
        </div>
        <div className="wt-panel-heading">
          <button type="button" className="btn-secondary wt-btn-sm" onClick={onOpenBrief}>
            <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
            Durum özeti
          </button>
          <button
            type="button"
            className="btn-ghost wt-icon-button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Kaynakları şimdi tara"
            title={updatedText ? `Son güncelleme ${updatedText} · şimdi tara` : 'Şimdi tara'}
          >
            <RefreshCw size={15} strokeWidth={1.75} className={refreshing ? 'wt-spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="wt-tabs" role="tablist" aria-label="Haber kategorisi">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className="wt-tab"
              onClick={() => setTab(tab.id as TabKey)}
            >
              {tab.id === 'bookmarks' ? <Star size={12} strokeWidth={1.75} aria-hidden="true" /> : null}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="wt-feed-tools">
        <label className="wt-search">
          <Search size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Haberlerde ara</span>
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Başlık veya kaynakta ara"
          />
        </label>
        {!isBookmarksTab ? (
          <button
            type="button"
            className="wt-toggle"
            aria-pressed={theatreOnly}
            onClick={() => setTheatreOnly(!theatreOnly)}
            title={
              theatreOnly
                ? 'Yalnız bölgedeki bir konuma bağlanan haberler gösteriliyor'
                : 'Tüm kaynakların bütün haberleri gösteriliyor'
            }
          >
            {theatreOnly ? 'Yalnız bölge' : 'Tüm haberler'}
          </button>
        ) : null}
      </div>

      <div
        className="wt-feed-list"
        aria-busy={loading}
        onScroll={(e) => {
          if (isBookmarksTab) return;
          const el = e.currentTarget;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (nearBottom && hasMore && !loading) {
            void loadMore();
          }
        }}
      >
        {loading && !isBookmarksTab && displayArticles.length === 0
          ? [1, 2, 3, 4].map((key) => <div key={key} className="wt-feed-skeleton wt-skeleton" />)
          : null}

        {error && displayArticles.length === 0 ? (
          <div className="wt-empty" role="alert">
            <p className="wt-empty-title">Haberler yüklenemedi</p>
            <p className="wt-empty-body">Sunucuya ulaşılamadı. Bağlantıyı kontrol edip tekrar deneyin.</p>
            <button type="button" className="btn-secondary wt-btn-sm" onClick={() => void fetchArticles()}>
              Tekrar dene
            </button>
            <p className="wt-empty-code">{error}</p>
          </div>
        ) : null}

        {emptyState ? (
          <div className="wt-empty">
            <p className="wt-empty-title">{emptyState.title}</p>
            <p className="wt-empty-body">{emptyState.body}</p>
            {emptyState.action ? (
              <button type="button" className="btn-secondary wt-btn-sm" onClick={emptyState.action.run}>
                {emptyState.action.label}
              </button>
            ) : null}
          </div>
        ) : (
          displayArticles.map((article) => (
            <FeedCard key={article.guid} article={article} query={searchQuery} forceBookmarkBorder={isBookmarksTab} />
          ))
        )}
      </div>
    </section>
  );
}

export default FeedPanel;
