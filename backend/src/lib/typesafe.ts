import dns from "dns";
import { Agent, fetch as undiciFetch } from "undici";
import { TypeSafeClient } from "@typesafe-ai/sdk";

/**
 * One long-lived TypeSafe client for the backend (topic relevance, summary
 * place check). The key stays server-side; without TYPESAFE_API_KEY every
 * caller gets null and keeps its non-model behaviour.
 */

// This network's resolver stalls ~12 s on AAAA queries for names without an
// IPv6 record (api.typesafe.ai is one). IPv4-only lookup avoids that stall.
const ipv4Agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => dns.lookup(hostname, { ...options, family: 4 }, callback)
  }
});

function ipv4Fetch(input: string, init?: RequestInit): Promise<Response> {
  return undiciFetch(input, { ...(init as object), dispatcher: ipv4Agent }) as unknown as Promise<Response>;
}

let client: TypeSafeClient | null | undefined;

export function getTypeSafeClient(): TypeSafeClient | null {
  if (client !== undefined) return client;
  client = process.env.TYPESAFE_API_KEY ? new TypeSafeClient({ fetch: ipv4Fetch, timeout: 15_000 }) : null;
  return client;
}

/** Pinned Jev versions are retired without notice; callers fall back to jev-latest. */
export function isRetiredModelError(err: unknown): boolean {
  return /unknown model|not found/i.test(String(err));
}
