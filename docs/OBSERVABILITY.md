# WARTRACKER — OBSERVABILITY & TELEMETRY ARCHITECTURE

## 1. Tracing & Correlation IDs

Every inbound HTTP request to the WARTRACKER backend is assigned a unique trace correlation ID via middleware in `backend/src/app.ts`:
- If incoming header `X-Request-Id` is provided by an upstream proxy, it is sanitized and adopted.
- If absent, a fresh UUID v4 is generated via `crypto.randomUUID()`.
- The correlation ID is attached to `req.id` and echoed in the HTTP response header `X-Request-Id`.

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
```

---

## 2. Health & Diagnostics API

WARTRACKER exposes three dedicated observability endpoints:

### 2.1 `/api/health` (Liveness)
- **Method**: `GET`
- **Purpose**: Fast container orchestrator ping.
- **Payload**:
```json
{
  "status": "ok"
}
```

### 2.2 `/api/ready` (Readiness)
- **Method**: `GET`
- **Purpose**: Verifies that SQLite is healthy and accepting read/write transactions.
- **Payload**:
```json
{
  "ok": true,
  "database": {
    "ok": true,
    "latencyMs": 0.12
  }
}
```

### 2.3 `/api/diagnostics` (System Metrics)
- **Method**: `GET`
- **Purpose**: Administrative telemetry inspection.
- **Payload**:
```json
{
  "ok": true,
  "uptimeSeconds": 86400,
  "timestamp": "2026-08-22T14:00:00.000Z",
  "memory": {
    "rssMb": 128.45,
    "heapTotalMb": 64.20,
    "heapUsedMb": 38.12
  },
  "database": {
    "ok": true,
    "latencyMs": 0.08,
    "eventsCount": 2150,
    "articlesCount": 5420
  }
}
```

---

## 3. Log Structured Format & Levels

Background workers and HTTP routes log with structured context:
- `[DB]`: Database connection, schema migrations, and checkpoint logs.
- `[RSS]`: Feed ingestion cycles, fetched article counts, and network status.
- `[CORROBORATION]`: Event clustering passes, confidence scores, and split explanations.
- `[BACKUP]`: Snapshot creation, SHA-256 calculation, and retention pruning.
- `[AI]`: Summarization queue status, provider fallback, and latency.
