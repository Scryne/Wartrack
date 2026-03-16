import RssParser from 'rss-parser';
import db from '../db';
import { extractGeoFromText } from '../lib/geoExtract';
import { computeReliability } from './reliability.service';
import { validateTurkishOutput } from '../lib/languageGuard';

export interface RssSource {
  name: string;
  url: string;
  category: string;
  fallbackUrls?: string[];
  userAgent?: string;
}

export const RSS_SOURCES: RssSource[] = [
  {
    name: 'Reuters World',
    url: 'https://feeds.reuters.com/reuters/worldNews',
    category: 'haber',
    fallbackUrls: ['https://www.reutersagency.com/feed/?best-topics=world&post_type=best']
  },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'haber' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'haber' },
  {
    name: 'AP News',
    url: 'https://rsshub.app/apnews/topics/world-news',
    category: 'haber',
    fallbackUrls: ['https://feeds.feedburner.com/apf-topnews']
  },
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'haber' },
  { name: 'France24 EN', url: 'https://www.france24.com/en/rss', category: 'haber' },
  { name: 'DW World', url: 'https://rss.dw.com/rdf/rss-en-world', category: 'haber' },
  {
    name: 'Times of Israel',
    url: 'https://www.timesofisrael.com/feed/',
    category: 'bölge',
    fallbackUrls: ['https://www.timesofisrael.com/topic/israel-middle-east/feed/']
  },
  { name: 'Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', category: 'bölge' },
  { name: "Iran Int'l", url: 'https://www.iranintl.com/en/rss', category: 'bölge' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', category: 'bölge' },
  { name: 'Haaretz EN', url: 'https://www.haaretz.com/srv/haaretz-main-feed.xml', category: 'bölge' },
  { name: 'Defense One', url: 'https://www.defenseone.com/rss/all/', category: 'savunma' },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/', category: 'analiz' },
  {
    name: 'ISW',
    url: 'https://www.understandingwar.org/rss.xml',
    category: 'analiz',
    fallbackUrls: ['https://understandingwar.org/rss.xml']
  }
];

export interface Article {
  id?: number;
  guid: string;
  title: string;
  description: string | null;
  link: string;
  pubDate: string | null;
  source: string;
  category: string;
  lat?: number | null;
  lng?: number | null;
  aiSummary?: string | null;
  createdAt?: string;
}

export interface GetArticlesOpts {
  limit?: number;
  offset?: number;
  category?: string;
  search?: string;
  source?: string;
}

export interface SourceStats {
  name: string;
  url: string;
  category: string;
  articleCount: number;
  lastArticle: string | null;
  health: 'healthy' | 'degraded' | 'open';
  failCount: number;
  lastError: string | null;
}

export interface FetchResult {
  sourcesScanned: number;
  newArticles: number;
  insertedArticles: Article[];
}

const parser = new RssParser({
  timeout: 15_000,
  maxRedirects: 4,
  customFields: {
    item: [['media:content', 'mediaContent'], ['content:encoded', 'contentEncoded']]
  }
});

const USER_AGENTS = [
  'WARTRACKER/3.0 (+https://wartracker.local)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36'
];

const sourceHealth = new Map<string, { failCount: number; openUntil: number; lastError: string | null }>();
const feedMetrics = {
  feed_fetch_403_total: 0,
  feed_parse_error_total: 0,
  source_circuit_open_total: 0
};

function getSourceState(sourceName: string) {
  const current = sourceHealth.get(sourceName);
  if (current) return current;
  const initial = { failCount: 0, openUntil: 0, lastError: null };
  sourceHealth.set(sourceName, initial);
  return initial;
}

const cleanDesc = (html = ''): string => html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim().slice(0, 500);

const insertManyArticles = db.transaction((articles: Article[]) => {
  const insertArticleStmt = db.prepare(`
    INSERT OR IGNORE INTO articles (guid, title, description, link, pubDate, source, category, lat, lng)
    VALUES (@guid, @title, @description, @link, @pubDate, @source, @category, @lat, @lng)
  `);

  const getArticleByGuidStmt = db.prepare(`
    SELECT id, guid, title, description, link, pubDate, source, category, lat, lng, aiSummary, createdAt
    FROM articles WHERE guid = ?
  `);

  const insertedRows: Article[] = [];
  for (const article of articles) {
    const result = insertArticleStmt.run(article);
    if (result.changes > 0) {
      const inserted = getArticleByGuidStmt.get(article.guid) as Article | undefined;
      if (inserted) insertedRows.push(inserted);
    }
  }
  return insertedRows;
});

const cleanupStmt = db.prepare(`DELETE FROM articles WHERE createdAt < datetime('now', '-7 days')`);
const existingCoordsStmt = db.prepare(`
  SELECT lat, lng
  FROM articles
  WHERE lat IS NOT NULL AND lng IS NOT NULL
`);
const countBySourceStmt = db.prepare(`
  SELECT source, COUNT(*) as cnt, MAX(pubDate) as lastPub
  FROM articles
  GROUP BY source
`);

function resolveConflict(
  lat: number,
  lng: number,
  existing: { lat: number; lng: number }[]
): [number, number] {
  let finalLat = lat;
  let finalLng = lng;
  let attempts = 0;

  while (attempts < 8) {
    const conflict = existing.some((e) =>
      Math.abs(e.lat - finalLat) < 0.3 &&
      Math.abs(e.lng - finalLng) < 0.3
    );
    if (!conflict) break;
    finalLat = lat + (Math.random() - 0.5) * 1.5;
    finalLng = lng + (Math.random() - 0.5) * 1.5;
    attempts++;
  }

  return [finalLat, finalLng];
}

async function fetchSingleSource(source: RssSource): Promise<Article[]> {
  const state = getSourceState(source.name);
  if (state.openUntil > Date.now()) {
    feedMetrics.source_circuit_open_total += 1;
    throw new Error(`Circuit open: ${source.name}`);
  }

  const feed = await fetchWithFallback(source);
  const items = feed.items.slice(0, 50);

  state.failCount = 0;
  state.openUntil = 0;
  state.lastError = null;

  return items.map((item) => {
    const guid = item.guid || item.link || `${source.name}-${item.pubDate}-${item.title?.slice(0, 20)}`;
    const pubDate = item.isoDate ? new Date(item.isoDate).toISOString() : item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
    const title = item.title?.trim() ?? '(no title)';
    const description = cleanDesc(item.contentSnippet || item.content || '');
    const coords = extractGeoFromText(`${title} ${description}`);

    return {
      guid,
      title,
      description,
      link: item.link ?? '',
      pubDate,
      source: source.name,
      category: source.category,
      lat: coords?.[0] ?? null,
      lng: coords?.[1] ?? null
    };
  });
}

function pickUserAgent(source: RssSource, attempt: number): string {
  if (source.userAgent) return source.userAgent;
  return USER_AGENTS[attempt % USER_AGENTS.length];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFeedText(url: string, source: RssSource, attempt: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': pickUserAgent(source, attempt),
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.5',
      'Accept-Language': 'en-US,en;q=0.8,tr;q=0.6',
      'Cache-Control': 'no-cache'
    }
  });

  if (response.status === 403) {
    feedMetrics.feed_fetch_403_total += 1;
    throw new Error(`HTTP 403 for ${source.name}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${source.name}`);
  return response.text();
}

function isBlockedHtml(text: string): boolean {
  const sample = text.slice(0, 900).toLowerCase();
  if (!sample.includes('<html')) return false;
  return sample.includes('forbidden') || sample.includes('access denied') || sample.includes('cloudflare');
}

async function fetchWithFallback(source: RssSource) {
  const urls = [source.url, ...(source.fallbackUrls ?? [])];
  let lastError: unknown;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const payload = await fetchFeedText(url, source, attempt);
        if (isBlockedHtml(payload)) throw new Error(`Blocked payload for ${source.name}`);
        return parser.parseString(payload);
      } catch (error) {
        lastError = error;
        await sleep(500 + Math.floor(Math.random() * 700));
      }
    }
  }

  const state = getSourceState(source.name);
  state.failCount += 1;
  state.lastError = String(lastError);
  if (state.failCount >= 3) {
    state.openUntil = Date.now() + 10 * 60_000;
  }

  const message = String(lastError);
  if (message.includes('parse') || message.includes('XML')) feedMetrics.feed_parse_error_total += 1;
  throw new Error(message);
}

export async function fetchAllFeeds(): Promise<FetchResult> {
  const firstPass = await Promise.allSettled(RSS_SOURCES.map((src) => fetchSingleSource(src)));

  const allArticles: Article[] = [];
  const failedSources: RssSource[] = [];

  firstPass.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    } else {
      console.warn(`[RSS] ${RSS_SOURCES[i].name} source failed: ${String(result.reason)}`);
      failedSources.push(RSS_SOURCES[i]);
    }
  });

  if (failedSources.length > 0) {
    await new Promise((r) => setTimeout(r, 1_000));
    const retryPass = await Promise.allSettled(failedSources.map((src) => fetchSingleSource(src)));
    retryPass.forEach((result) => {
      if (result.status === 'fulfilled') allArticles.push(...result.value);
    });
  }

  const insertedRows = saveArticles(allArticles);
  return {
    sourcesScanned: RSS_SOURCES.length,
    newArticles: insertedRows.length,
    insertedArticles: insertedRows
  };
}

export function saveArticles(articles: Article[]): Article[] {
  const existing = existingCoordsStmt.all() as { lat: number; lng: number }[];
  const normalized = articles.map((article) => {
    if (typeof article.lat !== 'number' || typeof article.lng !== 'number') {
      return article;
    }

    const [lat, lng] = resolveConflict(article.lat, article.lng, existing);
    existing.push({ lat, lng });
    return { ...article, lat, lng };
  });

  const insertedRows = insertManyArticles(normalized);
  cleanupStmt.run();
  return insertedRows;
}

export function getArticles(opts: GetArticlesOpts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (opts.category) {
    conditions.push('category = @category');
    params.category = opts.category;
  }
  if (opts.source) {
    conditions.push('source = @source');
    params.source = opts.source;
  }
  if (opts.search) {
    conditions.push('(title LIKE @search OR description LIKE @search)');
    params.search = `%${opts.search}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT id, guid, title, description, link, pubDate, source, category, aiSummary, lat, lng, createdAt
       FROM articles ${where}
       ORDER BY pubDate DESC, createdAt DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM articles ${where}`).get(params) as { total: number };

  const enriched = (rows as Article[]).map((row) => {
    const safeSummary = row.aiSummary && validateTurkishOutput(row.aiSummary).valid ? row.aiSummary : undefined;
    const reliability = computeReliability({
      source: row.source,
      title: row.title,
      description: row.description,
      pubDate: row.pubDate,
      corroborationCount: 1
    });
    return { ...row, aiSummary: safeSummary, ...reliability };
  });

  return {
    data: enriched,
    total: totalRow.total,
    limit,
    offset
  };
}

export function getSourceStats(): SourceStats[] {
  const rows = countBySourceStmt.all() as { source: string; cnt: number; lastPub: string | null }[];
  const statsMap = new Map(rows.map((r) => [r.source, { count: r.cnt, lastPub: r.lastPub }]));

  return RSS_SOURCES.map((src) => {
    const stat = statsMap.get(src.name);
    const health = getSourceState(src.name);
    const healthLabel: SourceStats['health'] = health.openUntil > Date.now() ? 'open' : health.failCount > 0 ? 'degraded' : 'healthy';
    return {
      name: src.name,
      url: src.url,
      category: src.category,
      articleCount: stat?.count ?? 0,
      lastArticle: stat?.lastPub ?? null,
      health: healthLabel,
      failCount: health.failCount,
      lastError: health.lastError
    };
  });
}

export function getFeedMetrics() {
  const total = RSS_SOURCES.length;
  const healthy = RSS_SOURCES.filter((src) => getSourceState(src.name).openUntil <= Date.now()).length;
  return {
    ...feedMetrics,
    feed_success_rate: Number(((healthy / total) * 100).toFixed(2))
  };
}
