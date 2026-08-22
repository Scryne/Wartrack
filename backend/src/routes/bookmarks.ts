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

// Prepared once rather than on each request; better-sqlite3 compiles on
// prepare(), so building these per call paid the compile cost every time.
const articleExistsStmt = db.prepare('SELECT 1 FROM articles WHERE id = ?');
const insertBookmarkStmt = db.prepare('INSERT OR IGNORE INTO bookmarks(articleId) VALUES (?)');
const deleteBookmarkStmt = db.prepare('DELETE FROM bookmarks WHERE articleId = ?');

router.post('/', (req, res) => {
  const articleId = Number((req.body as { articleId?: unknown })?.articleId);
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return res.status(400).json({ message: 'articleId is invalid.' });
  }

  try {
    // SQLite's OR IGNORE does not suppress foreign-key violations, only
    // uniqueness ones, so bookmarking a nonexistent article threw and surfaced
    // as a 500 — an internal error for what is plainly a bad request. Articles
    // are pruned after 7 days, so a stale client hits this routinely.
    if (!articleExistsStmt.get(articleId)) {
      return res.status(404).json({ message: 'Article not found.' });
    }

    insertBookmarkStmt.run(articleId);
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
    const result = deleteBookmarkStmt.run(articleId);
    // `removed` distinguishes a real deletion from a no-op. The route stays
    // idempotent (deleting twice is still a 200), but the caller can now tell.
    return res.json({ success: true, removed: result.changes > 0 });
  } catch (err) {
    console.error('[BOOKMARKS] DELETE /api/bookmarks/:articleId error:', err);
    return res.status(500).json({ message: 'Bookmark could not be deleted.' });
  }
});

export default router;
