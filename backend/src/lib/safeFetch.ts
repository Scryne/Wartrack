import { Agent, fetch as undiciFetch } from "undici";
import { guardedLookup } from "./ssrfGuard";

/**
 * Covers DNS as well as the TCP/TLS handshake: undici starts this clock before
 * it calls lookup. Some resolvers take 12-24 s for a cold name, which the
 * default 10 s turned into a failed feed.
 */
export const CONNECT_TIMEOUT_MS = 30_000;

/**
 * One shared agent for outbound fetches of third-party URLs. Its lookup
 * refuses private and reserved addresses, so the SSRF check applies to the
 * address actually dialled, including after every redirect hop.
 */
const guardedAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: CONNECT_TIMEOUT_MS }
});

export type SafeFetchInit = Omit<NonNullable<Parameters<typeof undiciFetch>[1]>, "dispatcher">;

export function safeFetch(url: string, init: SafeFetchInit = {}) {
  return undiciFetch(url, { ...init, dispatcher: guardedAgent });
}
