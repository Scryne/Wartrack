const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

const fallbackBase = `${window.location.protocol}//${window.location.hostname}:3001`;

export const API_BASE = fromEnv && fromEnv.length > 0 ? fromEnv : fallbackBase;

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
