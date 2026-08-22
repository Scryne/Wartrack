import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import type { Article } from '../types';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import { toSafeHref } from '../lib/safeUrl';

const CRITICAL = ['strike', 'attack', 'missile', 'bomb', 'nuclear', 'explosion', 'killed', 'war', 'intercept', 'launch', 'fire', 'drone'];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renderHighlighted(text: string, terms: string[], style: CSSProperties): ReactNode {
  if (!terms.length) return text;
  const pattern = terms.map((k) => escapeRegex(k)).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, idx) => {
    if (!part) return null;
    const matched = terms.some((term) => part.toLowerCase() === term.toLowerCase());
    if (!matched) return <Fragment key={`${part}-${idx}`}>{part}</Fragment>;
    return (
      <mark key={`${part}-${idx}`} style={style}>
        {part}
      </mark>
    );
  });
}

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    haber: 'var(--text-muted)',
    bölge: 'var(--amber)',
    bolge: 'var(--amber)',
    savunma: 'var(--red)',
    analiz: 'var(--purple)'
  };
  return map[cat] ?? 'var(--text-muted)';
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'simdi';
  if (m < 60) return `${m}dk`;
  if (m < 1440) return `${Math.floor(m / 60)}sa`;
  return `${Math.floor(m / 1440)}g`;
}

const FeedCard = ({ article, query, forceBookmarkBorder = false }: { article: Article; query: string; forceBookmarkBorder?: boolean }) => {
  const toggle = useBookmarkStore((s) => s.toggle);
  const saved = useBookmarkStore((s) => s.isBookmarked(article.id));
  const matches = useWatchlistStore((s) => s.matches);
  const [hovered, setHovered] = useState(false);
  const isCritical = CRITICAL.some((k) => article.title.toLowerCase().includes(k));
  const watchMatches = matches(`${article.title} ${article.description ?? ''}`);
  const isWatched = watchMatches.length > 0;

  const highlightedTitle = isWatched
    ? renderHighlighted(article.title, watchMatches, {
        background: 'rgba(245,166,35,0.25)',
        color: '#F5A623',
        borderRadius: 2,
        padding: '0 2px'
      })
    : query
      ? renderHighlighted(article.title, [query], {
          background: 'rgba(0,170,255,0.26)',
          color: '#F0F4F8'
        })
      : article.title;

  // article.link is third-party feed content. React renders a javascript: href
  // verbatim (it only warns), so the scheme has to be checked here. An
  // unusable link drops href entirely rather than rendering a dead anchor.
  const safeHref = toSafeHref(article.link);

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        position: 'relative',
        padding: '11px 14px',
        borderBottom: '1px solid var(--border)',
        borderLeft: forceBookmarkBorder
          ? '2px solid #A78BFA'
          : isWatched
            ? '2px solid #F5A623'
            : isCritical
              ? '2px solid #FF4444'
              : '2px solid transparent',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'background 0.1s',
        animation: 'slide-down 0.18s ease-out'
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        e.currentTarget.style.background = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggle(article.id).catch(() => undefined);
        }}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          color: saved ? '#A78BFA' : 'var(--text-muted)',
          opacity: saved || hovered ? 1 : 0,
          transition: 'all 0.15s',
          zIndex: 2
        }}
        aria-label={saved ? 'Kayit kaldir' : 'Haberi kaydet'}
      >
        {saved ? '★' : '☆'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingRight: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--accent)',
              background: 'var(--accent-dim)',
              border: '1px solid rgba(0,170,255,0.2)',
              padding: '1px 7px',
              borderRadius: 2,
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {article.source.toUpperCase()}
          </span>
          {isWatched ? (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: '#F5A623',
                background: 'rgba(245,166,35,0.12)',
                border: '1px solid rgba(245,166,35,0.3)',
                padding: '1px 6px',
                borderRadius: 2,
                letterSpacing: 0.5
              }}
            >
              ● İZLENİYOR
            </span>
          ) : null}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: categoryColor(article.category),
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            {article.category}
          </span>
          <span
            title={Array.isArray(article.reliabilitySignals) ? article.reliabilitySignals.join(' | ') : 'Guvenilirlik sinyali yok'}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color:
                typeof article.reliabilityScore === 'number'
                  ? article.reliabilityScore >= 75
                    ? '#00D084'
                    : article.reliabilityScore >= 50
                      ? '#F5A623'
                      : '#FF6B00'
                  : 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '1px 6px',
              borderRadius: 2
            }}
          >
            {typeof article.reliabilityScore === 'number' ? `%${article.reliabilityScore} ${article.confidenceLabel ?? ''}` : 'Yetersiz veri'}
          </span>
        </div>

        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            padding: '1px 6px',
            lineHeight: 1.2,
            flexShrink: 0
          }}
        >
          {formatRelativeTime(article.pubDate)}
        </span>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: isCritical ? 700 : 600,
          color: isCritical ? '#FFFFFF' : 'var(--text-primary)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {highlightedTitle}
      </p>

      {article.aiSummary &&
      article.aiSummary.length > 25 &&
      !article.aiSummary.includes('undefined') &&
      !article.aiSummary.includes('Özetlemek') &&
      !article.aiSummary.includes('summarize') ? (
        <p
          style={{
            marginTop: 5,
            paddingTop: 5,
            borderTop: '1px solid var(--border)',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {article.aiSummary}
        </p>
      ) : null}
    </a>
  );
};

export default FeedCard;
