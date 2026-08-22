# WARTRACKER

WARTRACKER is a real-time conflict intelligence dashboard built with a React frontend and an Express backend.
It combines live event feeds, map overlays, threat scoring, watchlists, and AI-assisted brief generation in one operational view.

## Highlights

- Live event feed with reliability scoring and language safety guards
- Interactive map with drawing tools, layers, and pinned locations
- Threat and event monitoring panels with WebSocket updates
- Bookmark and watchlist workflows for fast triage
- Optional AI briefing and summarization pipelines (Ollama or Gemini)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind, Zustand, Leaflet
- Backend: Node.js, Express, Socket.IO, TypeScript, SQLite (`better-sqlite3`)
- Testing: Vitest, Testing Library, Supertest
- Tooling: pnpm workspaces (separate frontend/backend lockfiles)

## Project Structure

- `frontend/` - Dashboard UI, map system, panels, and client-side stores
- `backend/` - API routes, feed ingestion, scoring, jobs, and DB access
- `start.ps1` - Starts frontend and backend together on Windows
- `.env.example` - Environment variable template

## Requirements

- Node.js 18+
- pnpm 10+
- PowerShell (for `start.ps1`)

## Getting Started

1. Install dependencies:

   ```powershell
   pnpm --dir frontend install
   pnpm --dir backend install
   ```

2. Create your env file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Set a shared secret. `.env.example` ships it **empty on purpose** — the
   backend will not start without one, and will not start with a placeholder
   value either:

   ```powershell
   # Generate a value and paste it into .env.local as API_SHARED_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Generate your own. Do not paste a secret from anywhere public — earlier
   versions of this file shipped a working one, which meant a copy-paste setup
   authenticated against a value published in the repository.

4. Start both services:

   ```powershell
   pnpm dev
   ```

5. Open the dashboard, click ⚙ **Ayarlar**, and paste the same value into
   **GUVENLIK > API anahtari**. Until you do, reads work but every write is
   rejected with `401`.

## Useful Commands

```powershell
# Everything CI runs, locally
pnpm --dir backend lint ; pnpm --dir backend typecheck ; pnpm --dir backend test:run
pnpm --dir frontend lint ; pnpm --dir frontend typecheck ; pnpm --dir frontend test:run

# Migration + smoke gates (both need a build first)
pnpm --dir backend build ; pnpm --dir backend migrate:check

# Start both services
pnpm dev

# Start services independently
pnpm dev:frontend
pnpm dev:backend

# Build both apps
pnpm build

# Run tests
pnpm --dir frontend test:run
pnpm --dir backend test:run
```

## Default Runtime Ports

- Frontend: `5173`
- Backend API/Socket: `3001`

## Environment Variables

See `.env.example` for a full template.

Key variables:

- `PORT` - Backend port (default `3001`)
- `DB_PATH` - SQLite database path
- `API_SHARED_SECRET` - **Required.** Shared secret for write requests (see below)
- `FRONTEND_URL` - Allowed frontend origin for CORS
- `VITE_API_URL` - Frontend API base URL
- `BRIEF_MODEL_ENABLED` - Enables AI briefing route (`0` or `1`)
- `OLLAMA_URL`, `OLLAMA_MODEL` - Local model provider settings
- `GEMINI_API_KEY` - Gemini API key (optional)
- `AI_LANG_GUARD`, `AI_SAFE_MODE` - AI output safety switches

## Authentication

WARTRACKER is a single-operator dashboard, so it uses one shared secret rather
than user accounts or sessions.

- **Writes are gated.** Every `POST`, `PUT`, `PATCH` and `DELETE` under `/api`
  must carry an `X-API-Key` header matching `API_SHARED_SECRET`. Anything else
  gets `401 {"error":"Unauthorized"}`.
- **Reads are open.** `GET` endpoints need no key, so the dashboard renders
  before you have configured one.
- **The backend refuses to boot** if `API_SHARED_SECRET` is unset, shorter than
  16 characters, or a known placeholder, rather than silently running
  unauthenticated or authenticating against a public value.
- **The browser stores the key in `localStorage`** (under `wartracker-auth`)
  after you enter it in Settings. It is never written to the server's settings
  table.

### LAN and mobile access

The backend listens on `0.0.0.0`, so anything on your network can reach it.
The shared secret is what stops other devices from creating pins, wiping
summaries, or driving up model costs — set a strong one and treat it like a
password.

Two caveats worth knowing:

- Traffic is plain HTTP. On an untrusted network the key is visible in transit;
  put it behind a TLS-terminating reverse proxy if that matters to you.
- The Socket.IO stream is **not** gated. It is broadcast-only — the client
  never sends anything to the server over it — and it carries the same
  aggregate counts already available from the open `GET` endpoints. Gating it
  would break live updates without protecting anything that isn't already
  readable.

### Calling the API directly

```powershell
# Read — no key needed
curl http://localhost:3001/api/feed?limit=5

# Write — key required
curl -X POST http://localhost:3001/api/feed/refresh -H "X-API-Key: <your-secret>"
```

## API Conventions

Every response under `/api` is JSON, including errors.

| Status | Meaning                                                          |
| ------ | ---------------------------------------------------------------- |
| `400`  | Bad input — malformed body, or a query parameter that is not a single well-formed value |
| `401`  | Missing or wrong `X-API-Key` on a mutating request               |
| `404`  | No such route, or the referenced row does not exist              |
| `429`  | Rate limited; a `Retry-After` header accompanies it              |
| `500`  | Internal error. The body is always `{"message":"Internal server error."}` — details go to the server log, never to the client |

Repeated query parameters (`?limit=1&limit=2`) and array/object forms
(`?category[]=a`) are rejected with a `400` rather than reaching the database.

## Operations

- The process exits non-zero on an uncaught exception, an unhandled rejection,
  or a port conflict, so a supervisor restarts it.
- `SIGTERM`/`SIGINT` drain in-flight requests and checkpoint SQLite before
  exiting. Windows does not deliver these signals; an abrupt kill is still safe
  (WAL writes are committed) but skips the checkpoint.
- `GET /api/health` is a liveness check.
- `GET /api/feed/health` reports per-source fetch success rates, circuit-breaker
  state, and scheduler health: `job_failure_total`, `last_failure_job` and
  `last_failure_at`. **Watch these.** node-cron catches a failing tick and
  discards the error, so a scheduler that has stopped ingesting looks identical
  to a quiet news day in every other signal.

### Behind a reverse proxy

Rate limits key on the client IP, which by default is the socket address. Put
the backend behind a TLS-terminating proxy and that address is the *proxy* for
every client, so one caller's burst throttles everyone. Set `TRUST_PROXY=1` so
Express reads `X-Forwarded-For` instead.

Only set it when a proxy really is in front. Without one, any client can send
its own `X-Forwarded-For` and get a fresh rate-limit bucket per request.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Gates |
| --- | --- |
| Backend | install (frozen lockfile) → native-binding check → lint → typecheck → tests → build → migration validation → live smoke test |
| Frontend | install (frozen lockfile) → lint → typecheck → tests → build |
| Secret hygiene | no tracked `.env`/`*.db`/keys, no credential in `.env.example`, no key literals in source |

Two of these are worth explaining, because they cover what unit tests cannot:

- **Migration validation** (`pnpm --dir backend migrate:check`) applies every
  migration to an *empty* database — the path a new install takes. The test
  suite migrates a seeded legacy database, so a migration that only works when
  a previous schema exists passes the suite and fails on first deploy.
- **Smoke test** boots the built server and drives it over real HTTP, asserting
  the auth, error-contract and validation behaviours. The in-process suite uses
  `createApp()` with supertest, which never executes `index.ts` and so cannot
  catch a boot failure or a missing native binding.

### Architecture guards

`backend/test/architecture.test.ts` and
`frontend/src/lib/__tests__/architecture.test.ts` assert invariants that a
normal test suite would not protect — removing an `asyncRoute()` wrapper,
dropping the error handler, deleting the coordinate `CHECK` constraint, adding
a development fallback for the shared secret, or rendering an unsanitised
`href` all keep every other test green. Each guard has been verified by
mutation: the change is applied, the suite is confirmed to fail, and the change
is reverted.

## Testing

This project includes backend API tests and frontend unit/component tests.

```powershell
pnpm --dir backend test:run
pnpm --dir frontend test:run
```

The backend suite builds its app through the same `createApp()` factory the
server uses, so middleware ordering, the JSON 404 and the error handler are
covered rather than bypassed.

## License

MIT License. See `LICENSE`.
