import { Router } from 'express';
import db from '../db';
import { getArticles, getSourceStats, fetchAllFeeds, getFeedMetrics, type ArticleScope } from '../services/rss.service';
import { computeReliability } from '../services/reliability.service';
import { validateTurkishOutput } from '../lib/languageGuard';
import { rateLimit } from '../lib/rateLimit';
import { QueryParamError, optionalInt, optionalString } from '../lib/queryParams';
import { asyncRoute } from '../lib/http';
import { jobMetrics } from '../lib/jobMetrics';

const router = Router();

function parseScope(value: string | undefined): ArticleScope {
  if (value === undefined || value === 'all') return 'all';
  if (value === 'theatre') return 'theatre';
  throw new QueryParamError("scope must be 'all' or 'theatre'");
}

router.get('/', (req, res) => {
  try {
    const opts = {
      limit: optionalInt(req.query.limit, 'limit', { fallback: 50, min: 1, max: 200 }),
      offset: optionalInt(req.query.offset, 'offset', { fallback: 0, min: 0, max: 1_000_000 }),
      category: optionalString(req.query.category, 'category'),
      search: optionalString(req.query.search, 'search'),
      source: optionalString(req.query.source, 'source'),
      scope: parseScope(optionalString(req.query.scope, 'scope'))
    };

    const result = getArticles(opts);
    res.json(result);
  } catch (err) {
    // A malformed query is the client's error, not ours. It used to reach the
    // SQLite bind and come back as a 500 ("datatype mismatch"), or — for
    // limit=abc — bind NaN, which SQLite reads as NULL, making LIMIT unbounded.
    if (err instanceof QueryParamError) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[RSS] GET /api/feed error:', err);
    res.status(500).json({ message: 'Feed articles could not be retrieved.' });
  }
});

interface MapPinArticleRow {
  id: number;
  title: string;
  source: string;
  pubDate: string;
  lat: number;
  lng: number;
  aiSummary: string | null;
  category: string;
  link: string;
}

router.get('/map-pins', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, title, source, pubDate, lat, lng, aiSummary, category, link
         FROM articles
         WHERE lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY pubDate DESC
         LIMIT 30`
      )
      .all() as MapPinArticleRow[];
    const enriched = rows.map((row) => ({
      ...row,
      aiSummary: row.aiSummary && validateTurkishOutput(String(row.aiSummary)).valid ? row.aiSummary : undefined,
      ...computeReliability({
        source: row.source,
        title: row.title,
        description: row.aiSummary ?? null,
        pubDate: row.pubDate,
        corroborationCount: 1
      })
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[RSS] GET /api/feed/map-pins error:', err);
    res.status(500).json({ message: 'Map pins could not be retrieved.' });
  }
});

router.get('/sources', (_req, res) => {
  try {
    const sources = getSourceStats();
    res.json(sources);
  } catch (err) {
    console.error('[RSS] GET /api/feed/sources error:', err);
    res.status(500).json({ message: 'Sources could not be retrieved.' });
  }
});

router.get('/health', (_req, res) => {
  try {
    // jobMetrics is what makes a stalled scheduler visible: fetch counters
    // alone stay flat both when nothing failed and when every tick threw.
    res.json({ ...getFeedMetrics(), ...jobMetrics });
  } catch (err) {
    console.error('[RSS] GET /api/feed/health error:', err);
    res.status(500).json({ message: 'Feed health could not be retrieved.' });
  }
});

// Each call fans out to 15 third-party feeds; trivially abusable as an
// outbound-traffic amplifier.
const refreshRateLimit = rateLimit({
  max: 6,
  windowMs: 60_000,
  message: 'Feed yenileme istekleri sınırlandırıldı.'
});

router.post('/refresh', refreshRateLimit, asyncRoute(async (req, res) => {
  try {
    const result = await fetchAllFeeds();

    const io = req.app.get('io');
    if (io) {
      result.insertedArticles.forEach((article) => {
        io.emit('article:new', article);
      });
      io.emit('feed:refreshed', {
        count: result.newArticles,
        sources: result.sourcesScanned
      });
      io.emit('stats:update');
    }

    res.json({ ok: true, sourcesScanned: result.sourcesScanned, newArticles: result.newArticles });
  } catch (err) {
    console.error('[RSS] POST /api/feed/refresh error:', err);
    res.status(500).json({ message: 'Feed refresh failed.' });
  }
}));

export default router;
