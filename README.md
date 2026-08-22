# WARTRACKER

WARTRACKER is a real-time tactical intelligence dashboard built with a React frontend and a hardened Express/SQLite backend.
It combines live OSINT event feeds, multi-signal corroboration clustering, explainable threat scoring, watchlists, and AI-assisted brief generation in one operational view.

## Highlights

- **Multi-Signal Corroboration Engine (`v2.1-tactical`)**: Cross-language entity tokenization (TR/EN), Great Circle spatial gating, hard contradiction splits, and true source independence attribution.
- **Explainable Threat Engine**: Real-time threat scoring (1-5) with causal driver attribution, temporal velocity analysis, and row-order independent invariant guarantees.
- **Fail-Closed Security Architecture**: Constant-time API authentication, SSRF protection against RFC 1918 / cloud metadata / loopback IPs, and strict input validation.
- **Transactional Disaster Recovery**: WAL-safe SQLite online snapshotting, atomic `.tmp -> final` promotion, `PRAGMA integrity_check` validation, and fail-closed live restore with rollback.
- **Empirical Scale Performance**: Measured sub-millisecond query latency (`p50 = 0.08ms` at 100k events), measured RTO (`6.09ms`), and verified memory stability over 10,000 soak cycles (`+0.84MB` heap growth).

---

## Architecture & Technical Documentation

- [Disaster Recovery & Backup Runbook](docs/DISASTER_RECOVERY_RUNBOOK.md)
- [Security Architecture & STRIDE Threat Model](docs/THREAT_MODEL.md)
- [Multi-Signal Corroboration Methodology](docs/CORROBORATION_METHODOLOGY.md)

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind, Zustand, Leaflet
- **Backend**: Node.js, Express, Socket.IO, TypeScript, SQLite (`better-sqlite3`)
- **Testing**: Vitest, Testing Library, Supertest
- **Tooling**: pnpm workspaces

---

## Quick Start

1. Install dependencies:
   ```powershell
   pnpm --dir frontend install
   pnpm --dir backend install
   ```

2. Create your environment configuration:
   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Generate a strong shared secret:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste the generated 64-hex string into `.env.local` as `API_SHARED_SECRET`.

4. Start both services:
   ```powershell
   pnpm dev
   ```

5. Open `http://localhost:5173`, navigate to **Ayarlar > Güvenlik**, and enter the API key.

---

## Validation & Test Execution

```powershell
# 1. Full Backend Invariant & Intelligence Test Suite (22 files / 207+ tests)
pnpm --dir backend test:run

# 2. Independent Hold-Out Corroboration Benchmark
pnpm --dir backend test:run test/corroboration_independent_evaluation.test.ts

# 3. Operational Disaster Recovery & RTO/RPO Drill
pnpm --dir backend test:run test/disaster_recovery_drill.test.ts test/backup.test.ts

# 4. Invariant Property & Monotonicity Suite (16 invariants)
pnpm --dir backend test:run test/threat_invariants.test.ts

# 5. Frontend Unit & Store Suite
pnpm --dir frontend test:run

# 6. Static Analysis & Type Checking
pnpm --dir backend lint ; pnpm --dir backend typecheck
pnpm --dir frontend lint ; pnpm --dir frontend typecheck

# 7. Migration Idempotency & Clean DB Smoke Gate
pnpm --dir backend build ; pnpm --dir backend migrate:check

# 8. Real HTTP CI Smoke Test
$env:API_SHARED_SECRET="smoke-secret-key-1234"; node .github/scripts/smoke.mjs
```

---

## License

MIT License. See `LICENSE`.
