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

3. Start both services:

   ```powershell
   pnpm dev
   ```

## Useful Commands

```powershell
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
- `FRONTEND_URL` - Allowed frontend origin for CORS
- `VITE_API_URL` - Frontend API base URL
- `BRIEF_MODEL_ENABLED` - Enables AI briefing route (`0` or `1`)
- `OLLAMA_URL`, `OLLAMA_MODEL` - Local model provider settings
- `GEMINI_API_KEY` - Gemini API key (optional)
- `AI_LANG_GUARD`, `AI_SAFE_MODE` - AI output safety switches

## Testing

This project includes backend API tests and frontend unit/component tests.

```powershell
pnpm --dir backend test:run
pnpm --dir frontend test:run
```

## License

MIT License. See `LICENSE`.
