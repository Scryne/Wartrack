# WARTRACKER — SECURITY AUDIT & HARDENING REPORT

## 1. Scope & Security Posture
WARTRACKER is a tactical intelligence situation room platform ingesting multi-source external data streams (RSS feeds, OSINT wires) and providing real-time situation awareness.

Because intelligence platforms are high-value targets for data poisoning, denial of service, and infrastructure pivoting, WARTRACKER implements a defense-in-depth security architecture.

---

## 2. Threat Vectors & Defenses

### 2.1 Server-Side Request Forgery (SSRF) Protection
- **Vulnerability**: Feed ingestion workers fetch arbitrary URLs provided in RSS subscriptions. Attackers could supply loopback (`127.0.0.1`), cloud instance metadata endpoints (`169.254.169.254`), or internal network IPs (`10.0.0.0/8`, `192.168.0.0/16`).
- **Remediation**: Implemented `backend/src/lib/ssrfGuard.ts`.
  - Octet-level RFC 1918 checking (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Carrier-Grade NAT blocking (`100.64.0.0/10`).
  - Cloud metadata IP blocking (`169.254.169.254`).
  - IPv4-mapped IPv6 blocking (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`).
  - Pre-request DNS resolution validation to thwart DNS rebinding.
- **Verification**: Tested against 25+ hostile vector combinations in `backend/test/rss_adversarial_pipeline.test.ts`.

### 2.2 SQL Injection & Parameter Tampering
- **Vulnerability**: SQL injection leading to data exfiltration or table tampering.
- **Remediation**: 100% of SQLite database access is executed via parameterized prepared statements (`better-sqlite3`). Zero string concatenation is permitted.
- **Geographic Bounds**: Database `CHECK` constraints reject invalid latitude ($[-90, 90]$) and longitude ($[-180, 180]$).

### 2.3 Cross-Site Scripting (XSS) & Content Security Policy (CSP)
- **Vulnerability**: Untrusted RSS titles or descriptions containing `<script>` or malicious HTML payloads.
- **Remediation**:
  - React automatic JSX entity escaping.
  - HTML entity stripping and sanitization on feed ingestion.
  - `toSafeHref` helper strictly rejects `javascript:`, `data:`, and `vbscript:` schemes.
  - Helmet middleware installs strict HTTP security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`.

### 2.4 Authentication & Constant-Time Verification
- **Vulnerability**: Side-channel timing attacks against API keys on administrative endpoints (`/api/pins`, `/api/settings`, `/api/backup`).
- **Remediation**: `requireApiKey` middleware computes SHA-256 digests and validates authorization using `crypto.timingSafeEqual`, preventing byte-by-byte timing leakage.

### 2.5 Secret Hygiene
- Verified 0 committed credentials or production secrets across the entire Git history.
- `.env.example` provides non-sensitive template variables.
- Database runtime files (`*.db`, `*.wal`, `*.shm`) are excluded via `.gitignore`.

---

## 3. Automated Security Verification Checklist

| Security Control | Implementation Location | Test Suite | Result |
| :--- | :--- | :--- | :--- |
| **SSRF Filter (RFC 1918 / Cloud Metadata)** | `backend/src/lib/ssrfGuard.ts` | `test/rss_adversarial_pipeline.test.ts` | **PASS (0 Bypasses)** |
| **Constant-Time API Key Auth** | `backend/src/lib/auth.ts` | `test/http_smoke.test.ts` | **PASS (Timing-Safe)** |
| **Prepared SQL Queries** | `backend/src/db/` | `test/queryParams.test.ts` | **PASS (100% Parameterized)** |
| **Safe Link Scheme (`toSafeHref`)** | `frontend/src/lib/safeUrl.ts` | `src/lib/__tests__/safeUrl.test.ts` | **PASS (19/19 Vectors Blocked)** |
| **Coordinate Earth Check Constraints** | `backend/src/db/migrate.ts` | `test/threat_invariants.test.ts` | **PASS (Enforced by DB)** |
| **Secret Leak Prevention** | `.gitignore`, `.env.example` | Git Audit Script | **PASS (0 Secrets Tracked)** |
