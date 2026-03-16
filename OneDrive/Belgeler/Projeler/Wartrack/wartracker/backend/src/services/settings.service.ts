import db from "../db";

const getSettingStmt = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1");

function readSetting(key: string): string | null {
  const row = getSettingStmt.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getStringSetting(key: string, fallback: string): string {
  const value = readSetting(key);
  if (value === null || value.trim() === "") return fallback;
  return value;
}

export function getBooleanSetting(key: string, fallback: boolean): boolean {
  const value = readSetting(key);
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function getNumberSetting(key: string, fallback: number, min?: number, max?: number): number {
  const value = readSetting(key);
  const parsed = value !== null ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  let next = parsed;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}
