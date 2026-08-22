import RssParser from 'rss-parser';
import db from '../db';
import { extractGeoFromText } from '../lib/geoExtract';
import { computeReliability } from './reliability.service';
import { validateTurkishOutput } from '../lib/languageGuard';
import { sqliteIsoNow, toIsoOrNull } from '../lib/time';
import { validateSafeUrl } from '../lib/ssrfGuard';

export interface RssSource {
  name: string;
  url: string;
  category: string;
  fallbackUrls?: string[];
  userAgent?: string;
}

export const RSS_SOURCES: RssSource[] = [
  // Replaced Reuters World: feeds.reuters.com no longer resolves (domain
  // retired) and the reutersagency.com fallback 404s. Reuters moved to the
  // licensed Reuters Connect product; no free public RSS remains.
  { name: 'CBS News World', url: 'https://www.cbsnews.com/latest/rss/world', category: 'haber' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'haber' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'haber' },
  // Replaced AP News: apnews.com/index.rss (their own autodiscovery target)
  // returns 401 "Invalid client credentials", the rsshub proxy sits behind a
  // Cloudflare challenge, and the Feedburner fallback 404s.
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', category: 'haber' },
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'haber' },
  { name: 'France24 EN', url: 'https://www.france24.com/en/rss', category: 'haber' },
  { name: 'DW World', url: 'https://rss.dw.com/rdf/rss-en-world', category: 'haber' },
  // Replaced Times of Israel: the whole domain sits behind a Cloudflare managed
  // JS challenge (cf-mitigated: challenge), homepage included. No HTTP client
  // can pass it without a headless browser, and UA rotation makes no difference.
  {
    name: 'Ynetnews',
    url: 'https://www.ynetnews.com/Integration/StoryRss3082.xml',
    category: 'bölge'
  },
  { name: 'Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', category: 'bölge' },
  // /en/rss returns the site's HTML app shell with 200 OK, which the parser
  // then choked on. /en/feed is the actual RSS endpoint.
  { name: "Iran Int'l", url: 'https://www.iranintl.com/en/feed', category: 'bölge' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', category: 'bölge' },
  // haaretz-main-feed.xml now 404s (empty body from their edge).
  { name: 'Haaretz EN', url: 'https://www.haaretz.com/srv/all-headlines-rss', category: 'bölge' },
  { name: 'Defense One', url: 'https://www.defenseone.com/rss/all/', category: 'savunma' },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/', category: 'analiz' },
  {
    // /rss.xml is 403 at the edge on both hosts (path-specific: the homepage
    // returns 200 with identical headers). Bare /feed/ redirects to the
    // homepage; the query parameter is what yields the real WordPress feed.
    name: 'ISW',
    url: 'https://understandingwar.org/feed/?post_type=post',
    category: 'analiz'
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
  source_circuit_open_total: 0,
  // Real attempt/success counters. feed_success_rate previously reported the
  // share of sources whose circuit breaker was closed, which reads 100% while
  // a source fails every fetch (the breaker only opens after 3 in a row).
  feed_fetch_attempt_total: 0,
  feed_fetch_success_total: 0
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

const cleanupStmt = db.prepare(`DELETE FROM articles WHERE createdAt < ${sqliteIsoNow("-7 days")}`);
const countBySourceStmt = db.prepare(`
  SELECT source, COUNT(*) as cnt, MAX(pubDate) as lastPub
  FROM articles
  GROUP BY source
`);

async function fetchSingleSource(source: RssSource): Promise<Article[]> {
  const state = getSourceState(source.name);
  if (state.openUntil > Date.now()) {
    feedMetrics.source_circuit_open_total += 1;
    throw new Error(`Circuit open: ${source.name}`);
  }

  feedMetrics.feed_fetch_attempt_total += 1;
  const feed = await fetchWithFallback(source);
  feedMetrics.feed_fetch_success_total += 1;
  const items = feed.items.slice(0, 50);

  state.failCount = 0;
  state.openUntil = 0;
  state.lastError = null;

  return items.map((item) => {
    const guid = item.guid || item.link || `${source.name}-${item.pubDate}-${item.title?.slice(0, 20)}`;
    // toIsoOrNull, not new Date(x).toISOString(): an unparseable feed date
    // makes toISOString() throw RangeError, which rejects the whole source.
    const pubDate =
      toIsoOrNull(item.isoDate) ?? toIsoOrNull(item.pubDate) ?? new Date().toISOString();
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

/**
 * Per-request deadline.
 *
 * The RssParser above is constructed with `timeout: 15_000`, but that only
 * applies to parser.parseURL(), which this code does not use — it fetches the
 * body itself and calls parseString(). So these requests had no deadline at
 * all: a publisher that accepts the connection and then stalls would hold a
 * fetch open indefinitely. fetchAllFeeds() runs all sources through
 * Promise.allSettled, so one hung source pins the whole ingestion cycle, and
 * runRssCycle's `rssJobRunning` guard then blocks every later cron tick.
 */
const FEED_FETCH_TIMEOUT_MS = 15_000;

/** A feed is text; anything this large is a misconfiguration or an attack. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;

async function fetchFeedText(initialUrl: string, source: RssSource, attempt: number): Promise<string> {
  let currentUrl = initialUrl;
  let redirectCount = 0;
  const MAX_REDIRECTS = 4;

  while (true) {
    const safeCheck = await validateSafeUrl(currentUrl);
    if (!safeCheck.valid) {
      throw new Error(`SSRF Blocked: URL for ${source.name} is unsafe (${safeCheck.reason})`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent': pickUserAgent(source, attempt),
          Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.5',
          'Accept-Language': 'en-US,en;q=0.8,tr;q=0.6',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal,
        redirect: 'manual'
      });

      // Handle redirects manually to prevent SSRF bypass via 3xx redirect to private/metadata IPs
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS}) for ${source.name}`);
        }
        const locationHeader = response.headers.get('location');
        if (!locationHeader) {
          throw new Error(`Redirect ${response.status} missing Location header for ${source.name}`);
        }
        currentUrl = new URL(locationHeader, currentUrl).toString();
        continue;
      }

      if (response.status === 403) {
        feedMetrics.feed_fetch_403_total += 1;
        throw new Error(`HTTP 403 for ${source.name}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${source.name}`);

      // Checked before reading the body: a declared length lets us refuse without
      // buffering. The post-read check below covers a response that omits it or
      // lies, since the source is third-party either way.
      const declaredLength = Number(response.headers.get('content-length') ?? NaN);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
        throw new Error(`Feed too large for ${source.name}: ${declaredLength} bytes`);
      }

      const text = await response.text();
      if (text.length > MAX_FEED_BYTES) {
        throw new Error(`Feed too large for ${source.name}: ${text.length} bytes`);
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isBlockedHtml(text: string): boolean {
  const sample = text.slice(0, 900).toLowerCase();
  if (!sample.includes('<html')) return false;
  return sample.includes('forbidden') || sample.includes('access denied') || sample.includes('cloudflare');
}

/**
 * True when a 200 response body is an HTML page rather than a feed.
 *
 * Publishers routinely serve their SPA shell, a soft-404, or a bot-challenge
 * page with a 200 status. Handing that to the XML parser produced misleading
 * errors ("Attribute without value", "Unencoded <") that read like a broken
 * feed rather than a wrong URL. Detecting it here yields a clear message and,
 * more usefully, lets fetchWithFallback move on to the next candidate URL.
 *
 * Prefix-matched rather than content-type sniffed: content-type is unreliable
 * (some working feeds are served as text/html), whereas a valid RSS/Atom
 * document never begins with an HTML doctype or <html> root.
 */
export function isHtmlPayload(text: string): boolean {
  // \uFEFF, not a literal BOM character. The literal form is invisible in
  // every editor and diff, so any tool that strips or normalises it would
  // silently turn this into `replace(/^/, '')` — a no-op — and BOM-prefixed
  // feeds would start being misread as non-feed payloads.
  const head = text.replace(/^\uFEFF/, '').trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

async function fetchWithFallback(source: RssSource) {
  const urls = [source.url, ...(source.fallbackUrls ?? [])];
  const ATTEMPTS_PER_URL = 2;
  const totalTries = urls.length * ATTEMPTS_PER_URL;
  let tries = 0;
  let lastError: unknown;

  for (const url of urls) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_URL; attempt++) {
      tries++;
      try {
        const payload = await fetchFeedText(url, source, attempt);
        if (isBlockedHtml(payload)) throw new Error(`Blocked payload for ${source.name}`);
        if (isHtmlPayload(payload)) {
          throw new Error(`Non-feed HTML payload for ${source.name} at ${url}`);
        }
        return parser.parseString(payload);
      } catch (error) {
        lastError = error;
        // No backoff after the final try: there is nothing left to back off
        // for, and the delay was charged to every caller of a dead source.
        if (tries < totalTries) {
          await sleep(500 + Math.floor(Math.random() * 700));
        }
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
  // Coordinates are stored exactly as the gazetteer resolved them. The former
  // resolveConflict() pass randomised any coordinate within 0.3° of an existing
  // one, compounding geoExtract's jitter to ~150km of drift, and polluted its
  // own conflict set with articles that INSERT OR IGNORE then discarded.
  const insertedRows = insertManyArticles(articles);
  cleanupStmt.run();
  return insertedRows;
}

/** Escape the characters LIKE treats as wildcards, for use with ESCAPE '\'. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
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
    // Escape LIKE's own wildcards. Without this, searching for "100%" matched
    // every article (the trailing % is a wildcard), and "_" matched any single
    // character — a search that silently answers a different question.
    conditions.push("(title LIKE @search ESCAPE '\\' OR description LIKE @search ESCAPE '\\')");
    params.search = `%${escapeLikePattern(opts.search)}%`;
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
  const circuitClosed = RSS_SOURCES.filter(
    (src) => getSourceState(src.name).openUntil <= Date.now()
  ).length;

  const attempts = feedMetrics.feed_fetch_attempt_total;

  return {
    ...feedMetrics,
    // What the old feed_success_rate actually measured, named honestly.
    feed_circuit_closed_rate: Number(((circuitClosed / total) * 100).toFixed(2)),
    // What it claimed to measure.
    feed_success_rate:
      attempts === 0
        ? 100
        : Number(((feedMetrics.feed_fetch_success_total / attempts) * 100).toFixed(2))
  };
}
