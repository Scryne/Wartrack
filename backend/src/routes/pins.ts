import { Router } from "express";
import db from "../db";
import { sqliteIsoNow } from "../lib/time";

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
  SET title = ?, description = ?, category = ?, updatedAt = ${sqliteIsoNow()}
  WHERE id = ?
`);

const deletePinStatement = db.prepare(`
  DELETE FROM pins
  WHERE id = ?
`);

/** Matches events.ts. A pin is rendered on a Leaflet map; the map has edges. */
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2_000;

function isPinCategory(value: unknown): value is PinCategory {
  return typeof value === "string" && PIN_CATEGORIES.includes(value as PinCategory);
}

/**
 * Parse a coordinate without Number()'s coercion of empty-ish values.
 *
 * `Number(null)`, `Number("")` and `Number([])` are all 0, and `Number([5])` is
 * 5, so a payload with `lat: null` used to pass `Number.isFinite` and land a
 * pin at 0°,0° — the Gulf of Guinea — with no error anywhere. Requiring an
 * actual number or numeric string makes an absent coordinate a 400 instead of
 * a plausible-looking wrong location.
 */
/** Decimal only. Number() also accepts "0x10" (16), "0b11" and "0o17". */
const DECIMAL_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

function parseCoordinate(value: unknown, name: string, bound: number): number | string {
  if (typeof value !== "number" && typeof value !== "string") {
    return `${name} must be a number.`;
  }

  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else {
    const trimmed = value.trim();
    // A latitude is never written in hex. Accepting "0x10" as 16 meant a
    // client could store a coordinate the sender plainly did not intend.
    if (!DECIMAL_NUMBER.test(trimmed)) {
      return `${name} must be a number.`;
    }
    parsed = Number(trimmed);
  }

  if (!Number.isFinite(parsed)) {
    return `${name} must be a number.`;
  }
  if (parsed < -bound || parsed > bound) {
    return `${name} must be between ${-bound} and ${bound}.`;
  }

  return parsed;
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
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const description =
    typeof candidate.description === "string" ? candidate.description.trim() : null;
  const category = candidate.category;

  const lat = parseCoordinate(candidate.lat, "lat", 90);
  if (typeof lat === "string") return { error: lat };

  const lng = parseCoordinate(candidate.lng, "lng", 180);
  if (typeof lng === "string") return { error: lng };

  if (!title) {
    return { error: "title is required." };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `title must be at most ${MAX_TITLE_LENGTH} characters.` };
  }

  if (description === null) {
    return { error: "description is required." };
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` };
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
  const category = candidate.category;

  // An omitted `description` keeps the stored value. It previously fell through
  // to "", so any update that did not resend the field silently erased it —
  // data loss with a 200 and no way for the client to notice.
  const description =
    candidate.description === undefined
      ? (pin.description ?? "")
      : typeof candidate.description === "string"
        ? candidate.description.trim()
        : null;

  if (!title || !isPinCategory(category) || description === null) {
    return res.status(400).json({ error: "Geçersiz pin verisi" });
  }

  if (title.length > MAX_TITLE_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: "Pin metni çok uzun" });
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
