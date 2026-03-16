import { Router } from 'express';
import db from '../db';
import { getArticles, getSourceStats, fetchAllFeeds, getFeedMetrics } from '../services/rss.service';
import { computeReliability } from '../services/reliability.service';
import { validateTurkishOutput } from '../lib/languageGuard';

const router = Router();

router.get('/', (req, res) => {
  try {
    const opts = {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      source: req.query.source as string | undefined
    };

    const result = getArticles(opts);
    res.json(result);
  } catch (err) {
    console.error('[RSS] GET /api/feed error:', err);
    res.status(500).json({ message: 'Feed articles could not be retrieved.' });
  }
});

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
      .all();
    const enriched = (rows as any[]).map((row) => ({
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
    res.json(getFeedMetrics());
  } catch (err) {
    console.error('[RSS] GET /api/feed/health error:', err);
    res.status(500).json({ message: 'Feed health could not be retrieved.' });
  }
});

router.post('/refresh', async (req, res) => {
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
});

export default router;
