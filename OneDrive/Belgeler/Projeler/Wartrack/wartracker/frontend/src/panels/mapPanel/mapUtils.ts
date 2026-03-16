import L from "leaflet";
import { useBookmarkStore } from "../../stores/useBookmarkStore";
import { useWatchlistStore } from "../../stores/useWatchlistStore";
import type { NewsPin } from "../../stores/useMapStore";
import type { Workspace } from "../../types";

export const WORKSPACES: Workspace[] = [
  { id: "iran-israel", name: "İRAN·İSRAİL", center: [32.0, 36.5], zoom: 6 },
  { id: "red-sea", name: "KIZILDENİZ", center: [18.0, 43.0], zoom: 6 },
  { id: "syria", name: "SURİYE", center: [35.0, 38.5], zoom: 7 }
];

export const CAT_COLOR: Record<string, string> = {
  haber: "rgba(148,163,184,0.8)",
  bölge: "#F5A623",
  savunma: "#60A5FA",
  analiz: "#A78BFA"
};

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

export function toSafeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "#";
}

export function makeShapeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isCritical(title: string): boolean {
  const t = title.toLowerCase();
  return CRITICAL_KW.some((k) => t.includes(k));
}

export function createNewsPinIcon(pin: NewsPin): L.DivIcon {
  const isSaved = useBookmarkStore.getState().isBookmarked(pin.id);
  if (isSaved) {
    return L.divIcon({
      html: "<div style='width:12px;height:12px;border-radius:50%;background:#A78BFA;border:1px solid rgba(255,255,255,0.35)'></div>",
      className: "",
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  }

  const watchMatches = useWatchlistStore.getState().matches(pin.title);
  const isWatched = watchMatches.length > 0;
  const crit = isCritical(pin.title);

  if (isWatched) {
    return L.divIcon({
      html: "<div style='position:relative;width:14px;height:14px'><div style='position:absolute;left:0;top:0;width:14px;height:14px;border-radius:50%;border:2px solid rgba(245,166,35,0.55)'></div><div style='position:absolute;left:3px;top:3px;width:8px;height:8px;border-radius:50%;background:#F5A623'></div></div>",
      className: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  const color = crit ? "#FF4444" : CAT_COLOR[pin.category] ?? "rgba(148,163,184,0.8)";

  if (!crit) {
    return L.divIcon({
      html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};border:1px solid rgba(255,255,255,0.25);opacity:0.85"></div>`,
      className: "",
      iconSize: [8, 8],
      iconAnchor: [4, 4]
    });
  }

  return L.divIcon({
    html: `<div style="position:relative;width:16px;height:16px"><div style="position:absolute;left:0;top:0;width:16px;height:16px;border-radius:50%;border:1px solid #FF4444;opacity:0.4;animation:blink-red 1.8s ease-in-out infinite"></div><div style="position:absolute;left:4px;top:4px;width:8px;height:8px;border-radius:50%;background:#FF4444"></div></div>`,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

export function manualIcon(category: string): L.DivIcon {
  const palette: Record<string, string> = {
    strike: "#FF3B3B",
    movement: "#F5A623",
    nuclear: "#9B6DFF",
    naval: "#00AAFF",
    air: "#00D084",
    info: "rgba(255,255,255,0.65)"
  };
  const color = palette[category] ?? palette.info;
  return L.divIcon({
    className: "",
    html: `<div style="width:11px;height:11px;border-radius:50%;background:${color};border:1px solid rgba(255,255,255,0.45)"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5]
  });
}
