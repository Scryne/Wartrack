import { Router } from "express";
import db from "../db";

const router = Router();

const PIN_CATEGORIES = [
  "strike",
  "movement",
  "nuclear",
  "naval",
  "air",
  "info"
] as const;

type PinCategory = (typeof PIN_CATEGORIES)[number];

interface PinRow {
  id: number;
  lat: number;
  lng: number;
  title: string;
  description: string | null;
  category: PinCategory;
  createdAt: string;
  updatedAt: string;
}

interface PinPayload {
  lat: number;
  lng: number;
  title: string;
  description: string;
  category: PinCategory;
}

const listPinsStatement = db.prepare(`
  SELECT id, lat, lng, title, description, category, createdAt, updatedAt
  FROM pins
  ORDER BY id DESC
`);

const getPinByIdStatement = db.prepare(`
  SELECT id, lat, lng, title, description, category, createdAt, updatedAt
  FROM pins
  WHERE id = ?
`);

const insertPinStatement = db.prepare(`
  INSERT INTO pins (lat, lng, title, description, category)
  VALUES (?, ?, ?, ?, ?)
`);

const updatePinStatement = db.prepare(`
  UPDATE pins
  SET title = ?, description = ?, category = ?, updatedAt = datetime('now')
  WHERE id = ?
`);

const deletePinStatement = db.prepare(`
  DELETE FROM pins
  WHERE id = ?
`);

function isPinCategory(value: unknown): value is PinCategory {
  return typeof value === "string" && PIN_CATEGORIES.includes(value as PinCategory);
}

function normalizePin(row: PinRow) {
  return {
    id: Number(row.id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function parsePinId(value: string): number | null {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function validatePinPayload(body: unknown): { data?: PinPayload; error?: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Invalid payload." };
  }

  const candidate = body as Record<string, unknown>;
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const description =
    typeof candidate.description === "string" ? candidate.description.trim() : null;
  const category = candidate.category;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "lat and lng must be valid numbers." };
  }

  if (!title) {
    return { error: "title is required." };
  }

  if (description === null) {
    return { error: "description is required." };
  }

  if (!isPinCategory(category)) {
    return { error: "category is invalid." };
  }

  return {
    data: {
      lat,
      lng,
      title,
      description,
      category
    }
  };
}

router.get("/", (_req, res) => {
  const rows = listPinsStatement.all() as PinRow[];
  res.json(rows.map(normalizePin));
});

router.post("/", (req, res) => {
  const validation = validatePinPayload(req.body);

  if (!validation.data) {
    return res.status(400).json({ message: validation.error });
  }

  const result = insertPinStatement.run(
    validation.data.lat,
    validation.data.lng,
    validation.data.title,
    validation.data.description,
    validation.data.category
  );

  const insertedRow = getPinByIdStatement.get(result.lastInsertRowid) as PinRow | undefined;

  if (!insertedRow) {
    return res.status(500).json({ message: "Pin could not be created." });
  }

  const normalized = normalizePin(insertedRow);

  // Emit socket events
  const io = req.app.get("io");
  if (io) {
    io.emit("pin:created", {
      id: normalized.id,
      lat: normalized.lat,
      lng: normalized.lng,
      category: normalized.category,
    });
    io.emit("stats:update");
  }

  return res.status(201).json(normalized);
});

router.put("/:id", (req, res) => {
  const pinId = parsePinId(req.params.id);

  if (pinId === null) {
    return res.status(400).json({ message: "Pin id is invalid." });
  }

  const pin = getPinByIdStatement.get(pinId) as PinRow | undefined;
  if (!pin) {
    return res.status(404).json({ error: "Pin bulunamadı" });
  }

  if (typeof req.body !== "object" || req.body === null) {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const candidate = req.body as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  const category = candidate.category;

  if (!title || !isPinCategory(category)) {
    return res.status(400).json({ error: "Geçersiz pin verisi" });
  }

  updatePinStatement.run(title, description, category, pinId);

  const io = req.app.get("io");
  if (io) {
    io.emit("pin:updated", {
      id: Number(pinId),
      title,
      description,
      category
    });
    io.emit("stats:update");
  }

  return res.json({ success: true });
});

router.delete("/:id", (req, res) => {
  const pinId = parsePinId(req.params.id);

  if (pinId === null) {
    return res.status(400).json({ message: "Pin id is invalid." });
  }

  const pin = getPinByIdStatement.get(pinId) as PinRow | undefined;
  if (!pin) {
    return res.status(404).json({ error: "Pin bulunamadı" });
  }

  deletePinStatement.run(pinId);

  // Emit socket events
  const io = req.app.get("io");
  if (io) {
    io.emit("pin:deleted", { id: Number(pinId) });
    io.emit("stats:update");
  }

  return res.json({ success: true });
});

export default router;
