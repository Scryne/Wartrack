/**
 * Timestamp parsing for values coming from the API.
 *
 * The backend stores and serialises every timestamp as ISO-8601 UTC
 * ("YYYY-MM-DDTHH:MM:SS.sssZ"). It previously stored createdAt in SQLite's
 * native "YYYY-MM-DD HH:MM:SS" form, which broke two things:
 *
 *  - `new Date("2026-08-07 13:00:00")` is parsed by V8 as *local* time while
 *    the value is UTC, silently shifting every rendered time by the viewer's
 *    UTC offset.
 *  - Comparing it as a string against `toISOString()` output always failed,
 *    because ' ' (0x20) sorts before 'T' (0x54).
 *
 * Always parse through here rather than calling `new Date(value)` directly, so
 * a regression in the wire format surfaces as NaN instead of a silent shift.
 */

/** Epoch milliseconds, or NaN when absent/unparseable. */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

/** True when `value` is at or after `cutoffMs`. False for unparseable input. */
export function isAtOrAfter(value: string | null | undefined, cutoffMs: number): boolean {
  const parsed = parseTimestamp(value);
  return Number.isFinite(parsed) && parsed >= cutoffMs;
}

/**
 * Compact Turkish relative time for list rows ("şimdi", "12 dk", "3 sa", "2 g").
 * Future timestamps (misdated feed items) read as "şimdi" rather than negative.
 */
export function formatRelativeTime(value: string | null | undefined, now: number = Date.now()): string {
  const parsed = parseTimestamp(value);
  if (!Number.isFinite(parsed)) return '—';
  const minutes = Math.floor((now - parsed) / 60_000);
  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`;
  return `${Math.floor(minutes / 1440)} g`;
}
