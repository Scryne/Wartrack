# WARTRACKER — STRIDE THREAT MODEL

## 1. System Architecture & Trust Boundaries

WARTRACKER operates across 4 core trust boundaries:
1. **External Ingestion Boundary**: Untrusted public internet RSS feeds and OSINT sources.
2. **Client-Server Boundary**: Browser client interacting with the Express HTTP / WebSocket backend.
3. **Application-Storage Boundary**: Express backend accessing local SQLite WAL database files.
4. **Application-LLM Boundary**: Node.js backend dispatching summarization prompts to local/remote Ollama inference engines.

```
       [ Public RSS Feeds / OSINT ]
                    │  (Untrusted Ingestion Boundary)
                    ▼
          [ ssrfGuard / Parser ]
                    │
                    ▼
[ React Client ] ───► [ Express 4 API Backend ] ───► [ Ollama LLM ]
 (Browser UI)    ▲          │
                 │          ▼
        (Client-Server) [ SQLite WAL Database ]
```

---

## 2. STRIDE Threat Analysis

### 2.1 Spoofing (Identity & Feeds)
- **Threat**: Attacker creates fake RSS endpoints mimicking Reuters/AP to inject fabricated tactical reports.
- **Mitigation**: Feed URLs are configured solely by administrators via `FEED_SOURCES` environment variables or authenticated `/api/feed` endpoints. Wire agency source attribution verifies authentic syndication strings (`wire:reuters`, `wire:ap`).
- **Threat**: Attacker spoofs client identity to modify system settings or tactical pins.
- **Mitigation**: All write routes gated by `requireApiKey` constant-time secret token header `X-API-Key`.

### 2.2 Tampering (Data Modification)
- **Threat**: Malicious actors inject SQL payloads or tamper with HTTP query filters.
- **Mitigation**: 100% prepared SQL statements; strict runtime schema validation; database CHECK constraints enforcing valid coordinate ranges $[-90, 90]$ and $[-180, 180]$.
- **Threat**: Tampering with offline database backups.
- **Mitigation**: Backup engine computes SHA-256 digests recorded in signed companion `.meta.json` artifacts; restore workflow validates checksum and aborts on hash mismatch.

### 2.3 Repudiation (Audit Trail)
- **Threat**: Operator executes unauthorized tactical adjustments (e.g. deleting pins, triggering database restores) without auditability.
- **Mitigation**: Structured logging with `X-Request-Id` correlation tokens recording timestamp, IP address, user-agent, and operation result across all write actions.

### 2.4 Information Disclosure (Data Leakage)
- **Threat**: Ingestion worker accesses AWS/GCP instance metadata (`169.254.169.254`) leaking cloud IAM credentials.
- **Mitigation**: `backend/src/lib/ssrfGuard.ts` blocks all link-local, carrier NAT, loopback, and RFC 1918 IPs before HTTP socket initialization.
- **Threat**: Unhandled exceptions leak database schema and stack traces to HTTP clients.
- **Mitigation**: Centralized `errorHandler` in `backend/src/lib/http.ts` masks internal error messages in production mode, returning clean JSON status objects.

### 2.5 Denial of Service (Availability)
- **Threat**: Attacker submits extremely large RSS XML payloads or infinite redirect loops to exhaust Node.js memory.
- **Mitigation**: Ingestion worker enforces max redirect limits ($N=3$), 5000ms socket timeouts, and maximum payload byte sizes (2 MB).
- **Threat**: Database lock contention during high-throughput ingestion or active backup creation.
- **Mitigation**: SQLite configured with `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000`; backup uses SQLite Online Backup API with mutex concurrency locking.

### 2.6 Elevation of Privilege (Access Control)
- **Threat**: Unauthenticated operator accesses administrative backup or restore endpoints.
- **Mitigation**: `/api/backup/create` and `/api/backup/restore` routes strictly gated behind `requireApiKey` middleware.
