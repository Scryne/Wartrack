/**
 * Single source of truth for timestamp format.
 *
 * Every timestamp column in this database stores ISO-8601 UTC
 * ("YYYY-MM-DDTHH:MM:SS.sssZ"), byte-identical to JavaScript's
 * Date#toISOString(). This matters for two reasons:
 *
 *  1. Timestamps are compared as TEXT in SQL. Mixing SQLite's native
 *     "YYYY-MM-DD HH:MM:SS" with ISO-8601 silently breaks every comparison,
 *     because ' ' (0x20) sorts before 'T' (0x54).
 *  2. `new Date("YYYY-MM-DD HH:MM:SS")` is parsed by V8 as *local* time,
 *     while the stored value is UTC. ISO-8601 with the 'Z' suffix is
 *     unambiguous and parses identically everywhere.
 *
 * Do not use CURRENT_TIMESTAMP or datetime('now') anywhere in this codebase.
 */

const ISO_STRFTIME_FORMAT = "%Y-%m-%dT%H:%M:%fZ";

/** Only allow modifiers we author ourselves, never user input. */
const SAFE_MODIFIER = /^[+-]?\d+(\.\d+)? (second|minute|hour|day|month|year)s?$/;

/**
 * A SQL expression yielding the current time as ISO-8601 UTC.
 *
 * @param modifiers SQLite date modifiers, e.g. "-6 hours", "-7 days".
 */
export function sqliteIsoNow(...modifiers: string[]): string {
  for (const modifier of modifiers) {
    if (!SAFE_MODIFIER.test(modifier)) {
      throw new Error(`Unsafe SQLite date modifier: ${modifier}`);
    }
  }

  const args = ["'now'", ...modifiers.map((m) => `'${m}'`)].join(", ");
  return `strftime('${ISO_STRFTIME_FORMAT}', ${args})`;
}

/** A SQL expression converting an existing column/value to ISO-8601 UTC. */
export function sqliteToIso(expression: string): string {
  return `strftime('${ISO_STRFTIME_FORMAT}', ${expression})`;
}

/** True when a stored value is already in ISO-8601 UTC form. */
export function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value);
}

/**
 * Normalize any date-ish input to ISO-8601 UTC, or null when unparseable.
 *
 * Guards the ingestion path: `new Date("garbage").toISOString()` throws
 * RangeError, which would otherwise reject an entire RSS source.
 */
export function toIsoOrNull(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
