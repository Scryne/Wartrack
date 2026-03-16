import { Router } from "express";
import db from "../db";
import {
  summarizeArticle,
  getQueueStatus,
  getLatestSummaries,
  clearInvalidSummaries,
  clearRecentSummaries,
  getUnsummarized,
} from "../services/summarize.service";

const router = Router();

interface ArticleRow {
  id: number;
  title: string;
  description: string | null;
  aiSummary: string | null;
}

const getArticleByIdStmt = db.prepare(`
  SELECT id, title, description, aiSummary FROM articles WHERE id = ?
`);

/* GET /api/summarize/status — queue status */
router.get("/status", (_req, res) => {
  res.json(getQueueStatus());
});

/* GET /api/summarize/latest — latest summaries for ticker */
router.get("/latest", (req, res) => {
  const limit = Math.min(Number(req.query?.limit) || 5, 20);
  const summaries = getLatestSummaries(limit);
  res.json(summaries);
});

/* POST /api/summarize/rebuild — clear invalid + regenerate batch */
router.post("/rebuild", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 150);
    const force = String(req.query.force ?? "0") === "1";
    const cleared = force ? clearRecentSummaries(limit * 6) : clearInvalidSummaries(limit * 4);
    const targets = getUnsummarized(limit);
    setImmediate(async () => {
      let summarized = 0;
      for (const article of targets) {
        try {
          const text = `${article.title}\n${article.description ?? ""}`;
          const result = await summarizeArticle(article.id, text);
          if (result.model !== "none") summarized++;

          const io = req.app.get("io");
          if (io && result.model !== "none") {
            io.emit("article:summarized", {
              id: article.id,
              aiSummary: result.summary,
              model: result.model,
            });
          }
        } catch {
          continue;
        }
      }
      console.warn(`[AI] Rebuild batch tamamlandı: ${summarized}/${targets.length}`);
    });

    return res.json({ ok: true, force, cleared, queued: targets.length });
  } catch (err) {
    console.error("[AI] POST /api/summarize/rebuild error:", err);
    return res.status(500).json({ message: "Rebuild failed." });
  }
});

/* POST /api/summarize/:id — instant summarize request */
router.post("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid article ID." });
  }

  const article = getArticleByIdStmt.get(id) as ArticleRow | undefined;
  if (!article) {
    return res.status(404).json({ message: "Article not found." });
  }

  if (article.aiSummary) {
    return res.json({ summary: article.aiSummary, model: "cached", articleId: id });
  }

  try {
    const text = `${article.title}\n${article.description ?? ""}`;
    const result = await summarizeArticle(id, text);

    if (result.model !== "none") {
      const io = req.app.get("io");
      if (io) {
        io.emit("article:summarized", {
          id,
          aiSummary: result.summary,
          model: result.model,
        });
      }
    }

    return res.json({ ...result, articleId: id });
  } catch (err) {
    console.error("[AI] POST /api/summarize error:", err);
    return res.status(500).json({ message: "Summarization failed." });
  }
});

export default router;
