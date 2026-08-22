import { Router } from "express";
import db from "../db";
import {
  summarizeArticle,
  getQueueStatus,
  getLatestSummaries,
  clearInvalidSummaries,
  clearRecentSummaries,
  getUnsummarized,
  type UnsummarizedArticle,
} from "../services/summarize.service";
import { rateLimit } from "../lib/rateLimit";
import { QueryParamError, optionalInt } from "../lib/queryParams";
import { asyncRoute } from "../lib/http";

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
  try {
    // The old Math.min(Number(x) || 5, 20) had no lower bound: limit=-5 reached
    // SQLite as `LIMIT -5`, which SQLite reads as "no limit".
    const limit = optionalInt(req.query.limit, "limit", { fallback: 5, min: 1, max: 20 });
    res.json(getLatestSummaries(limit));
  } catch (err) {
    if (err instanceof QueryParamError) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("[AI] GET /api/summarize/latest error:", err);
    res.status(500).json({ message: "Summaries could not be retrieved." });
  }
});

/* POST /api/summarize/rebuild — clear invalid + regenerate batch */
// Destructive: force=1 nulls up to limit*6 (=900) existing summaries per call
// and re-queues them, which then costs provider quota to regenerate.
const rebuildRateLimit = rateLimit({
  max: 2,
  windowMs: 5 * 60_000,
  message: "Yeniden oluşturma istekleri sınırlandırıldı."
});

/**
 * The rebuild batch, run detached after the response is sent.
 *
 * Extracted and given its own error boundary because it is a fire-and-forget
 * promise: setImmediate does not adopt the returned promise, so anything that
 * escaped the per-article catch would become an unhandledRejection — which
 * index.ts treats as fatal. The response has already gone out by then, so the
 * caller would see a success and the server would exit.
 */
async function runRebuildBatch(
  targets: UnsummarizedArticle[],
  io: { emit: (event: string, payload: unknown) => void } | undefined
): Promise<void> {
  let summarized = 0;

  for (const article of targets) {
    try {
      const text = `${article.title}\n${article.description ?? ""}`;
      const result = await summarizeArticle(article.id, text);
      if (result.model === "none") continue;

      summarized++;
      io?.emit("article:summarized", {
        id: article.id,
        aiSummary: result.summary,
        model: result.model
      });
    } catch (err) {
      console.error(`[AI] Rebuild failed for article #${article.id}:`, err);
    }
  }

  console.warn(`[AI] Rebuild batch tamamlandı: ${summarized}/${targets.length}`);
}

router.post("/rebuild", rebuildRateLimit, (req, res) => {
  try {
    const limit = optionalInt(req.query.limit, "limit", { fallback: 30, min: 1, max: 150 });
    const force = String(req.query.force ?? "0") === "1";
    const cleared = force ? clearRecentSummaries(limit * 6) : clearInvalidSummaries(limit * 4);
    const targets = getUnsummarized(limit);
    const io = req.app.get("io");

    // Explicit .catch, not a bare setImmediate(async () => ...): the latter
    // leaves a floating promise whose rejection has nowhere to go.
    setImmediate(() => {
      void runRebuildBatch(targets, io).catch((err) => {
        console.error("[AI] Rebuild batch crashed:", err);
      });
    });

    return res.json({ ok: true, force, cleared, queued: targets.length });
  } catch (err) {
    if (err instanceof QueryParamError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("[AI] POST /api/summarize/rebuild error:", err);
    return res.status(500).json({ message: "Rebuild failed." });
  }
});

/* POST /api/summarize/:id — instant summarize request */
router.post("/:id", asyncRoute(async (req, res) => {
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
}));

export default router;
