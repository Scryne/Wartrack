import { Router } from 'express';
import db from '../db';

const router = Router();

router.get('/', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT a.id, a.guid, a.title, COALESCE(a.description, '') AS description,
                a.link, a.pubDate, a.source, a.category, a.aiSummary
         FROM bookmarks b
         JOIN articles a ON a.id = b.articleId
         ORDER BY a.pubDate DESC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error('[BOOKMARKS] GET /api/bookmarks error:', err);
    res.status(500).json({ message: 'Bookmarks could not be retrieved.' });
  }
});

router.post('/', (req, res) => {
  const articleId = Number((req.body as { articleId?: unknown })?.articleId);
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return res.status(400).json({ message: 'articleId is invalid.' });
  }

  try {
    db.prepare('INSERT OR IGNORE INTO bookmarks(articleId) VALUES (?)').run(articleId);
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('[BOOKMARKS] POST /api/bookmarks error:', err);
    return res.status(500).json({ message: 'Bookmark could not be created.' });
  }
});

router.delete('/:articleId', (req, res) => {
  const articleId = Number(req.params.articleId);
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return res.status(400).json({ message: 'articleId is invalid.' });
  }

  try {
    db.prepare('DELETE FROM bookmarks WHERE articleId = ?').run(articleId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[BOOKMARKS] DELETE /api/bookmarks/:articleId error:', err);
    return res.status(500).json({ message: 'Bookmark could not be deleted.' });
  }
});

export default router;
