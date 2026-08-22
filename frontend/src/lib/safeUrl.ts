/**
 * Scheme validation for links that came from outside this application.
 *
 * Article `link` values are whatever a third-party RSS feed put in its <link>
 * element. React escapes text content, but it does *not* sanitise `href`: it
 * logs a warning for a `javascript:` URL and then renders it anyway, so
 * `<a href={article.link}>` executes attacker-controlled script on click.
 * `data:` and `vbscript:` are equivalent hazards.
 *
 * Allowlisting http/https is the check, rather than blocklisting `javascript:`,
 * because a blocklist loses to `java\tscript:`, `JaVaScRiPt:`, leading control
 * characters and other parser quirks. URL() resolves those before we look.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * The URL if it is safe to put in an href, otherwise undefined.
 *
 * Returning undefined rather than "#" lets the caller omit href entirely, so
 * the element is not a link at all instead of a link that goes nowhere.
 */
export function toSafeHref(url: string | null | undefined): string | undefined {
  if (typeof url !== "string") return undefined;

  const trimmed = url.trim();
  if (!trimmed) return undefined;

  try {
    // Absolute-only: a relative URL would resolve against this dashboard's own
    // origin, which is never what an article link means.
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return undefined;

    // Return the parsed form, not the input. The parser strips tabs, newlines
    // and control characters before resolving the scheme, so `trimmed` and
    // `parsed.href` can differ — handing back the input would mean validating
    // one string and rendering another. It also percent-encodes `"`, `<` and
    // `>`, though notably *not* `'`; callers that interpolate into a quoted
    // HTML attribute still need their own escaping (see mapUtils.toSafeUrl).
    return parsed.href;
  } catch {
    return undefined;
  }
}
