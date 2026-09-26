import dns from "dns";
import { promisify } from "util";
import net from "net";

const dnsLookup = promisify(dns.lookup);

/**
 * Checks whether an IPv4 address falls within private, loopback, link-local, or reserved ranges.
 * Uses exact octet checking to avoid JS 32-bit signed bitwise overflow pitfalls.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [o1, o2, o3] = parts;

  // 0.0.0.0/8 (Current network)
  if (o1 === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (o1 === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (o1 === 127) return true;
  // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  // 169.254.0.0/16 (Link-Local / Cloud Metadata 169.254.169.254)
  if (o1 === 169 && o2 === 254) return true;
  // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (o1 === 192 && o2 === 0 && o3 === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (o1 === 192 && o2 === 0 && o3 === 2) return true;
  // 192.168.0.0/16 (Private network)
  if (o1 === 192 && o2 === 168) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (o1 === 198 && o2 === 51 && o3 === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (o1 === 203 && o2 === 0 && o3 === 113) return true;
  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (o1 >= 224 && o1 <= 239) return true;
  // 240.0.0.0/4 (Reserved / Broadcast: 240.0.0.0 - 255.255.255.255)
  if (o1 >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address falls within loopback, link-local, unique local, or mapped IPv4 private ranges.
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // ::1 / Loopback
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // :: / Unspecified
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  const v4MappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedDotted) {
    return isPrivateOrReservedIpv4(v4MappedDotted[1]);
  }
  const v4MappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4MappedHex) {
    const high = parseInt(v4MappedHex[1], 16);
    const low = parseInt(v4MappedHex[2], 16);
    const ipInt = ((high << 16) | low) >>> 0;
    const ipStr = `${(ipInt >>> 24) & 255}.${(ipInt >>> 16) & 255}.${(ipInt >>> 8) & 255}.${ipInt & 255}`;
    return isPrivateOrReservedIpv4(ipStr);
  }

  // Unique Local (fc00::/7 -> fc00 to fdff)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;

  // Link-Local (fe80::/10 -> fe80 to febf)
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;

  // Documentation / Example prefix (2001:db8::/32)
  if (lower.startsWith("2001:db8:") || lower.startsWith("2001:0db8:")) return true;

  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  resolvedIp?: string;
}

export interface UrlShapeResult extends UrlValidationResult {
  /** Set when the host is a name whose addresses still need checking. */
  hostname?: string;
}

/**
 * Everything about a URL that can be judged without DNS: scheme, embedded
 * credentials, loopback/metadata host names and literal private IPs.
 */
export function validateUrlShape(rawUrl: string): UrlShapeResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, reason: "URL must be a non-empty string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: "Malformed or unparseable URL" };
  }

  // Enforce http/https only
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: `Forbidden URL protocol: ${parsed.protocol}. Only http: and https: are permitted.` };
  }

  // Prohibit credentials embedded in URL
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "URL with embedded user credentials is prohibited" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, "");

  // Prohibit localhost and cloud metadata aliases directly
  if (
    cleanHost === "localhost" ||
    cleanHost === "localhost.localdomain" ||
    cleanHost.endsWith(".localhost") ||
    cleanHost === "metadata.google.internal" ||
    cleanHost === "instance-data"
  ) {
    return { valid: false, reason: `Forbidden loopback or metadata hostname: ${cleanHost}` };
  }

  // If hostname is directly an IPv4 address
  if (net.isIPv4(cleanHost)) {
    if (isPrivateOrReservedIpv4(cleanHost)) {
      return { valid: false, reason: `Target IP ${cleanHost} is within private/reserved network space` };
    }
    return { valid: true, resolvedIp: cleanHost };
  }

  // If hostname is directly an IPv6 address or IPv4-mapped IPv6
  if (net.isIPv6(cleanHost) || cleanHost.startsWith("::ffff:")) {
    if (isPrivateOrReservedIpv6(cleanHost)) {
      return { valid: false, reason: `Target IPv6 ${cleanHost} is within private/reserved network space` };
    }
    return { valid: true, resolvedIp: cleanHost };
  }

  return { valid: true, hostname: cleanHost };
}

/** First resolved address that lies in private/reserved space, or null. */
function findPrivateAddress(records: dns.LookupAddress[]): dns.LookupAddress | null {
  for (const record of records) {
    if (record.family === 4 && isPrivateOrReservedIpv4(record.address)) return record;
    if (record.family === 6 && isPrivateOrReservedIpv6(record.address)) return record;
  }
  return null;
}

/**
 * Validates a target URL against SSRF attack vectors, private networks,
 * localhost, cloud metadata endpoints, and unsupported protocols.
 *
 * This resolves the hostname to answer "is it safe?", but the answer only
 * holds for that lookup: a later connection resolves again and may get a
 * different address (DNS rebinding). Code that actually connects should use
 * validateUrlShape() plus guardedLookup (see lib/safeFetch), which checks the
 * very addresses the socket connects to.
 */
export async function validateSafeUrl(rawUrl: string): Promise<UrlValidationResult> {
  const shape = validateUrlShape(rawUrl);
  if (!shape.valid || !shape.hostname) return shape;
  const host = shape.hostname;

  try {
    const lookupResult = await dnsLookup(host, { all: true });
    const blocked = findPrivateAddress(lookupResult);
    if (blocked) {
      return {
        valid: false,
        reason: `Hostname ${host} resolved to private IPv${blocked.family} ${blocked.address}`
      };
    }
    return { valid: true, resolvedIp: lookupResult[0]?.address };
  } catch (err) {
    return { valid: false, reason: `DNS lookup failed for hostname ${host}: ${String(err)}` };
  }
}

/**
 * A `lookup` for net/tls connect options that refuses private addresses.
 *
 * The check runs on the addresses the socket is about to use, so there is no
 * gap between validation and connection for a rebinding resolver to exploit,
 * and each connection costs one DNS query instead of two. The second point is
 * not cosmetic: getaddrinfo runs on libuv's four-thread pool, and with a slow
 * resolver the doubled lookups for fifteen feeds queued long enough to push
 * every connection past its timeout, so no feed was ever fetched.
 */
export const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, records) => {
    if (err) {
      callback(err, options.all ? [] : "", undefined);
      return;
    }
    const blocked = findPrivateAddress(records);
    if (blocked) {
      const error: NodeJS.ErrnoException = new Error(
        `SSRF Blocked: ${hostname} resolved to private IPv${blocked.family} ${blocked.address}`
      );
      error.code = "ESSRFBLOCKED";
      callback(error, options.all ? [] : "", undefined);
      return;
    }
    if (options.all) {
      callback(null, records);
      return;
    }
    const [first] = records;
    callback(null, first.address, first.family);
  });
};
