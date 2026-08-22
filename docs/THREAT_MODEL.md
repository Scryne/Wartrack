# WARTRACKER — Security Architecture & Threat Model

## 1. Threat Model Overview
WARTRACKER ingests third-party open-source intelligence (OSINT), RSS feeds, and real-time alerts. Because external news and telemetry feeds represent untrusted, potentially hostile input boundaries, the architecture enforces a strict **Zero-Trust Input Boundary** and **Fail-Closed Security Policy**.

---

## 2. Assets & Trust Boundaries

### 2.1 Critical Assets
1. **Intelligence Database (`wartracker.db`)**: Tactical events, pins, articles, and corroborated clusters.
2. **Operational Backups**: Verified database snapshots containing historical telemetry.
3. **Authentication Secret (`API_SHARED_SECRET`)**: Shared key controlling mutating write APIs.
4. **Internal Network Perimeter**: Localhost services, internal cluster resources, cloud metadata APIs (`169.254.169.254`).

### 2.2 Attack Vectors & Threat Actors
- **Hostile RSS Publisher**: Serves oversized payloads, XML entity bombs, loopback redirects, or poisoned tactical claims.
- **Malicious Network Attacker**: Attempts SSRF to access cloud metadata or internal services.
- **Unauthorized Client**: Attempts unauthenticated writes, deletions, or configuration modifications.
- **Adversarial Information Operations**: Distributes duplicated syndicated reports to manipulate corroboration confidence.

---

## 3. STRIDE Threat Analysis & Mitigations

### 3.1 Server-Side Request Forgery (SSRF)
- **Threat**: Attackers providing feed URLs or redirects targeting internal IPs (`127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`).
- **Mitigation**: `ssrfGuard.ts` implements RFC 1918 private range blocking, carrier NAT blocking, cloud metadata blocking, IPv4-mapped IPv6 decoding, and DNS resolution validation prior to HTTP dispatch.
- **Verification**: `backend/test/rss_adversarial_pipeline.test.ts` tests 25+ malicious URL vectors.

### 3.2 Authentication & Authorization Bypass
- **Threat**: Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) without valid API keys.
- **Mitigation**: Fail-closed constant-time secret comparison (`crypto.timingSafeEqual`) via `requireApiKey`. Rejects placeholder passwords (`changeme`, `replace-me`) and secrets shorter than 16 characters at boot.
- **Verification**: `backend/test/adversarial_audit.test.ts` validates all 14 mutating endpoints.

### 3.3 Untrusted Ingestion & XML / DoS Attacks
- **Threat**: Huge payloads (>5MB), decompression bombs, malformed XML, or bot-challenge HTML pages.
- **Mitigation**: Size clamping (`MAX_FEED_BYTES = 5MB`), strict fetch deadlines (`FEED_FETCH_TIMEOUT_MS = 15,000ms`), `isHtmlPayload` sanitization, and fallback circuit breakers.

### 3.4 False Corroboration & Syndication Manipulation
- **Threat**: Syndicated wire reports (e.g. 5 news portals copying 1 Reuters story) artificially inflating corroboration confidence to HIGH.
- **Mitigation**: `resolveIndependentSourceCount` groups articles by cited wire agency (`wire:reuters`, `wire:ap`, `wire:afp`, `wire:aa`) to calculate true independent sources.

### 3.5 Database & Path Traversal Injection
- **Threat**: SQL injection in query parameters, or directory traversal during backup/restore.
- **Mitigation**: 100% prepared parameterized SQL statements (`better-sqlite3`), `escapeLikePattern` for wildcard escaping, and path normalization (`path.resolve`).

---

## 4. Residual Risk Assessment

| Threat | Initial Risk | Mitigation | Residual Risk |
| :--- | :--- | :--- | :--- |
| **SSRF via DNS Rebinding** | CRITICAL | `ssrfGuard` validates both pre-resolved and resolved IP addresses. | LOW (Acceptable) |
| **Syndication Echo Chambers** | HIGH | Multi-agency source attribution clustering. | LOW (Acceptable) |
| **Database Corruption on Crash** | HIGH | Online WAL backup API + fail-closed restore with `.pre-restore.bak` rollback. | LOW (Acceptable) |
| **Denial of Service via Heavy Feeds** | MEDIUM | 5MB response size limit + 15s timeout per request. | LOW (Acceptable) |
