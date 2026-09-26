import { useAuthStore } from "../stores/useAuthStore";
import { showToast } from "../components/Toast";

const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

const fallbackBase = `${window.location.protocol}//${window.location.hostname}:3001`;

export const API_BASE = fromEnv && fromEnv.length > 0 ? fromEnv : fallbackBase;

export const API_KEY_HEADER = "X-API-Key";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

/** Mirrors the backend's gate: only these carry the shared secret. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Thrown on 401 so callers can distinguish auth failure from a network error. */
export class ApiKeyError extends Error {
  constructor(message = "Geçersiz veya eksik API anahtarı") {
    super(message);
    this.name = "ApiKeyError";
  }
}

// A single failed write often triggers several parallel requests; only tell
// the user once per burst.
const UNAUTHORIZED_TOAST_COOLDOWN_MS = 5_000;
let lastUnauthorizedToastAt = 0;

function notifyUnauthorized(): void {
  const now = Date.now();
  if (now - lastUnauthorizedToastAt < UNAUTHORIZED_TOAST_COOLDOWN_MS) return;
  lastUnauthorizedToastAt = now;

  showToast(
    useAuthStore.getState().hasApiKey()
      ? "API anahtarı sunucudakiyle eşleşmiyor. Ayarlar > Erişim bölümünden kontrol edin."
      : "Bu işlem için API anahtarı gerekli. Ayarlar > Erişim bölümünden girin.",
    "error"
  );
}

/**
 * The single place every API call goes through.
 *
 * Attaches X-API-Key to mutating requests and converts a 401 into an
 * ApiKeyError plus a user-visible toast. The toast matters because many call
 * sites swallow errors (`.catch(() => undefined)`), so without it an auth
 * failure would look like nothing happening at all.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING_METHODS.has(method)) {
    const apiKey = useAuthStore.getState().apiKey.trim();
    if (apiKey) headers.set(API_KEY_HEADER, apiKey);
  }

  const response = await fetch(apiUrl(path), { ...init, headers });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new ApiKeyError();
  }

  return response;
}
