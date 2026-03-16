import { useEffect, useMemo, useState } from 'react';
import FeedCard from '../components/FeedCard';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { useFeedStore } from '../stores/useFeedStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';

const TABS = [
  { id: 'all', label: 'TUM' },
  { id: 'haber', label: 'HABER' },
  { id: 'bölge', label: 'BOLGE' },
  { id: 'savunma', label: 'SAVUNMA' },
  { id: 'analiz', label: 'ANALIZ' },
  { id: 'bookmarks', label: '★ Kayitli' }
] as const;
type TabKey = (typeof TABS)[number]['id'];

interface FeedPanelProps {
  onOpenBrief: () => void;
}

function FeedPanel({ onOpenBrief }: FeedPanelProps) {
  const {
    articles,
    loading,
    activeTab,
    searchQuery,
    total,
    lastUpdated,
    refreshing,
    hasMore,
    filteredArticles,
    fetchArticles,
    setTab,
    setSearch,
    refresh,
    loadMore
  } = useFeedStore();
  const bookmarkArticles = useBookmarkStore((s) => s.articles);
  const watchKeywords = useWatchlistStore((s) => s.keywords);

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const isBookmarksTab = activeTab === 'bookmarks';
  const orderedArticles = useMemo(() => filteredArticles(), [articles, watchKeywords, filteredArticles]);
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

  const updatedText = useMemo(() => {
    if (!lastUpdated) return '--:--';
    return lastUpdated.toLocaleTimeString('tr-TR', { hour12: false });
  }, [lastUpdated]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="panel-title">◈ HABERLER</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              letterSpacing: 0.4
            }}
          >
            <span style={{ color: 'var(--accent)' }}>◈</span>
            <span style={{ color: 'var(--text-primary)' }}>{articleCount} makale</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={onOpenBrief}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: '#A78BFA',
              letterSpacing: 0.5
            }}
          >
            🤖 DURUM ÖZETİ
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            {updatedText}
          </span>
          <button className="btn-ghost" onClick={() => void refresh()}>
            {refreshing ? '...' : 'YENILE'}
          </button>
        </div>
      </div>

      <div
        style={{
          height: 36,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          padding: '0 14px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 0,
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id as TabKey)}
              onMouseEnter={(e) => {
                if (active) return;
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                if (active) return;
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 1,
                padding: '0 12px',
                whiteSpace: 'nowrap',
                height: 35,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                transition: 'color 0.12s',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: active ? -1 : 0
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ height: 40, flexShrink: 0, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 10,
              top: 6,
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)'
            }}
          >
            ⌕
          </span>
          <input
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="⌕  Ara..."
            style={{
              width: '100%',
              height: 28,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 10px 0 28px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-primary)',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          />
        </div>
      </div>

      <div
        style={{ flex: 1, overflowY: 'auto' }}
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
          ? [1, 2, 3].map((key) => (
              <div
                key={key}
                style={{
                  height: 92,
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  opacity: 0.7,
                  animation: 'pulse-dot 1.2s infinite'
                }}
              />
            ))
          : null}

        {!loading && displayArticles.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)'
            }}
          >
            {isBookmarksTab ? '★ Henuz kaydedilen haber yok.' : 'HABER BULUNAMADI'}
          </div>
        ) : (
          displayArticles.map((article) => (
            <FeedCard
              key={article.guid}
              article={article}
              query={searchQuery}
              forceBookmarkBorder={isBookmarksTab}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default FeedPanel;
