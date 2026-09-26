import L from "leaflet";
import { useBookmarkStore } from "../../stores/useBookmarkStore";
import { useWatchlistStore } from "../../stores/useWatchlistStore";
import type { NewsPin } from "../../stores/useMapStore";
import { toSafeHref } from "../../lib/safeUrl";

export { WORKSPACES } from "../../data/workspaces";

/** Marker colours come from the chart tokens (index.css), not literals. */
export const CAT_COLOR: Record<string, string> = {
  haber: "var(--color-chart-6)",
  bölge: "var(--color-chart-2)",
  savunma: "var(--color-chart-4)",
  analiz: "var(--color-chart-3)"
};

export const PIN_COLOR: Record<string, string> = {
  strike: "var(--color-chart-1)",
  movement: "var(--color-chart-2)",
  nuclear: "var(--color-chart-3)",
  naval: "var(--color-chart-4)",
  air: "var(--color-chart-5)",
  info: "var(--color-fg-muted)"
};

export { tokenColor } from "../../lib/tokens";

/** WCAG 2.5.8: the dot stays small, the clickable area does not. */
const HIT = 24;

function dot(size: number, color: string, extra = ""): L.DivIcon {
  return L.divIcon({
    html: `<span class="wt-marker-hit"><span class="wt-marker ${extra}" style="--marker-size:${size}px;--marker-color:${color}"></span></span>`,
    className: "",
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2]
  });
}

const CRITICAL_KW = [
  "missile strike",
  "air strike",
  "airstrike",
  "ballistic missile",
  "nuclear attack",
  "explosion kills",
  "bombs fell",
  "launched attack",
  "military strike",
  "fuze saldirisi",
  "hava saldirisi",
  "bombalama",
  "nukleer saldiri",
  "roket atildi",
  "füze saldırısı",
  "hava saldırısı",
  "nükleer saldırı",
  "roket atıldı"
];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate scheme AND escape for HTML-attribute interpolation.
 *
 * Scheme validation alone is not enough: the value is interpolated into a
 * single-quoted href, so an RSS `link` containing an apostrophe could close
 * the attribute and inject another (e.g. `https://x.test/a'onmouseover='...`).
 * Feed content is third-party, so this is attacker-reachable.
 *
 * The scheme half is delegated to toSafeHref so this and FeedCard's React
 * `href` cannot drift apart; only the escaping is specific to the string
 * interpolation Leaflet popups require.
 */
export function toSafeUrl(url: string): string {
  return escapeHtml(toSafeHref(url) ?? "#");
}

export function makeShapeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isCritical(title: string): boolean {
  const t = title.toLowerCase();
  return CRITICAL_KW.some((k) => t.includes(k));
}

export function createNewsPinIcon(pin: NewsPin): L.DivIcon {
  if (useBookmarkStore.getState().isBookmarked(pin.id)) {
    return dot(12, "var(--color-accent)", "wt-marker-saved");
  }
  if (useWatchlistStore.getState().matches(pin.title).length > 0) {
    return dot(12, "var(--color-warning)", "wt-marker-ring");
  }
  if (isCritical(pin.title)) {
    return dot(12, "var(--color-danger)", "wt-marker-ring");
  }
  return dot(9, CAT_COLOR[pin.category] ?? CAT_COLOR.haber);
}

export function manualIcon(category: string): L.DivIcon {
  return dot(11, PIN_COLOR[category] ?? PIN_COLOR.info, "wt-marker-manual");
}
