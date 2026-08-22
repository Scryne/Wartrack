/**
 * Query-string parsing that fails loudly instead of reaching SQLite.
 *
 * Express parses the query string with `qs`, so `?limit=1&limit=2` and
 * `?category[]=a` arrive as arrays and `?x[y]=1` as an object — a client
 * controls the *type*, not just the value. Passing those through to a
 * better-sqlite3 bind throws ("SQLite3 can only bind numbers, strings,
 * bigints, buffers, and null"), and `Number("abc")` binds NaN, which SQLite
 * treats as NULL: `LIMIT NULL` quietly means "no limit" and
 * `severity >= NULL` quietly matches nothing.
 *
 * Both failure modes are wrong answers dressed as 500s or empty result sets.
 * These helpers turn them into 400s.
 */

/** Raised for a malformed parameter; routes translate it into a 400. */
export class QueryParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryParamError";
  }
}

/**
 * A single string value, or undefined when absent.
 *
 * @throws QueryParamError if the parameter was repeated or sent as an object.
 */
export function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new QueryParamError(`${name} must be a single value.`);
  }
  return value;
}

/**
 * A finite integer clamped to [min, max], or `fallback` when absent.
 *
 * Clamps rather than rejects an out-of-range number — `limit=1000` is a
 * reasonable "give me everything" and capping it is the intended behaviour —
 * but rejects values that are not numbers at all, since those signal a broken
 * client rather than an ambitious one.
 *
 * @throws QueryParamError if the parameter is repeated, or not a number.
 */
export function optionalInt(
  value: unknown,
  name: string,
  { fallback, min, max }: { fallback: number; min: number; max: number }
): number {
  const raw = optionalString(value, name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new QueryParamError(`${name} must be a number.`);
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
