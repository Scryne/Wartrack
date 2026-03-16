import { Router } from "express";
import pinsRouter from "./pins";
import feedRouter from "./feed";
import summarizeRouter from "./summarize";
import eventsRouter from "./events";
import settingsRouter from "./settings";
import bookmarksRouter from "./bookmarks";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "wartracker-backend" });
});

router.use("/pins", pinsRouter);
router.use("/feed", feedRouter);
router.use("/summarize", summarizeRouter);
router.use("/events", eventsRouter);
router.use("/settings", settingsRouter);
router.use("/bookmarks", bookmarksRouter);

export default router;
