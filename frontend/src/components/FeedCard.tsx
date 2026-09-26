import { Fragment, type ReactNode } from 'react';
import { Star } from 'lucide-react';
import type { Article } from '../types';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import { toSafeHref } from '../lib/safeUrl';
import { formatRelativeTime } from '../lib/time';

const CRITICAL = ['strike', 'attack', 'missile', 'bomb', 'nuclear', 'explosion', 'killed', 'war', 'intercept', 'launch', 'fire', 'drone'];

/** The summarizer's answer for stories outside the theatre; not a summary. */
const OFF_TOPIC_SUMMARY = 'Bölgesel çatışmayla doğrudan ilgisi yok.';

const CATEGORY: Record<string, { label: string; color: string }> = {
  haber: { label: 'Haber', color: 'var(--color-chart-6)' },
  bölge: { label: 'Bölge', color: 'var(--color-chart-2)' },
  bolge: { label: 'Bölge', color: 'var(--color-chart-2)' },
  savunma: { label: 'Savunma', color: 'var(--color-chart-4)' },
  analiz: { label: 'Analiz', color: 'var(--color-chart-3)' }
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renderHighlighted(text: string, terms: string[], className: string): ReactNode {
  if (!terms.length) return text;
  const pattern = terms.map((k) => escapeRegex(k)).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, idx) => {
    if (!part) return null;
    const matched = terms.some((term) => part.toLowerCase() === term.toLowerCase());
    if (!matched) return <Fragment key={`${part}-${idx}`}>{part}</Fragment>;
    return (
      <mark key={`${part}-${idx}`} className={className}>
        {part}
      </mark>
    );
  });
}

function reliabilityTone(score: number): string {
  if (score >= 75) return 'var(--color-success)';
  if (score >= 50) return 'var(--color-warning)';
  return 'var(--color-threat-4)';
}

const FeedCard = ({ article, query, forceBookmarkBorder = false }: { article: Article; query: string; forceBookmarkBorder?: boolean }) => {
  const toggle = useBookmarkStore((s) => s.toggle);
  const saved = useBookmarkStore((s) => s.isBookmarked(article.id));
  const matches = useWatchlistStore((s) => s.matches);
  const isCritical = CRITICAL.some((k) => article.title.toLowerCase().includes(k));
  const watchMatches = matches(`${article.title} ${article.description ?? ''}`);
  const isWatched = watchMatches.length > 0;
  const category = CATEGORY[article.category] ?? { label: article.category, color: 'var(--color-chart-6)' };

  const title = isWatched
    ? renderHighlighted(article.title, watchMatches, 'wt-mark-watch')
    : query
      ? renderHighlighted(article.title, [query], 'wt-mark-search')
      : article.title;

  // article.link is third-party feed content. React renders a javascript: href
  // verbatim (it only warns), so the scheme has to be checked here. An
  // unusable link drops href entirely rather than rendering a dead anchor.
  const safeHref = toSafeHref(article.link);

  const summary =
    article.aiSummary &&
    article.aiSummary.length > 25 &&
    article.aiSummary.trim() !== OFF_TOPIC_SUMMARY &&
    !article.aiSummary.includes('undefined') &&
    !article.aiSummary.includes('Özetlemek') &&
    !article.aiSummary.includes('summarize')
      ? article.aiSummary
      : null;

  const accent = forceBookmarkBorder || saved
    ? 'saved'
    : isWatched
      ? 'watched'
      : isCritical
        ? 'critical'
        : undefined;

  const published = new Date(article.pubDate);

  return (
    <article className="wt-card" data-accent={accent}>
      <div className="wt-card-meta">
        <span className="wt-card-source">{article.source}</span>
        <span className="wt-card-category">
          <span className="wt-dot" style={{ background: category.color }} aria-hidden="true" />
          {category.label}
        </span>
        {typeof article.reliabilityScore === 'number' ? (
          <span
            className="wt-card-reliability"
            style={{ color: reliabilityTone(article.reliabilityScore) }}
            title={Array.isArray(article.reliabilitySignals) ? article.reliabilitySignals.join(' · ') : undefined}
          >
            Güvenilirlik %{article.reliabilityScore}
          </span>
        ) : null}
        {isWatched ? <span className="wt-card-flag">İzleniyor</span> : null}
        <time
          className="wt-card-time"
          dateTime={article.pubDate}
          title={Number.isNaN(published.getTime()) ? undefined : published.toLocaleString('tr-TR')}
        >
          {formatRelativeTime(article.pubDate)}
        </time>
      </div>

      <h3 className="wt-card-title" data-critical={isCritical}>
        {safeHref ? (
          <a href={safeHref} target="_blank" rel="noopener noreferrer" className="wt-card-link">
            {title}
          </a>
        ) : (
          title
        )}
      </h3>

      {summary ? <p className="wt-card-summary">{summary}</p> : null}

      <button
        type="button"
        className="wt-card-save"
        data-saved={saved}
        aria-pressed={saved}
        aria-label={saved ? 'Kaydı kaldır' : 'Haberi kaydet'}
        onClick={() => void toggle(article.id).catch(() => undefined)}
      >
        <Star size={15} strokeWidth={1.75} fill={saved ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
};

export default FeedCard;
