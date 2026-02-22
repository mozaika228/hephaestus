# Hephaestus

Hephaestus is a multi-platform AI assistant (web + desktop + mobile) with a modular backend for chat, file analysis, planning, and integrations.

## Repository Layout
- `apps/web` - Next.js web application
- `apps/desktop` - Electron desktop shell
- `apps/mobile` - Flutter mobile client
- `services/api` - Node.js API (chat, files, planner, integrations)
- `services/ai` - FastAPI service (analysis helpers and jobs)
- `services/orchestrator` - FastAPI multi-agent graph orchestrator
- `packages/shared` - shared constants and utilities
- `infra` - infrastructure assets

## Core Capabilities
- Chat assistant with streaming responses
- Multi-provider model routing (OpenAI, Ollama)
- File ingestion and analysis workflows
- Planner tasks and job queue endpoints
- Enterprise SSO endpoints (SAML start/callback flow scaffold)
- API analytics summary endpoints (request/error/performance breakdown)
- Multi-agent orchestration endpoint (`/orchestrator/run` -> graph service)
- Web/Desktop/Mobile client surfaces

## Architecture
1. Client sends requests to `services/api`.
2. API routes requests to provider adapters or `services/ai`.
3. API can route high-level tasks to `services/orchestrator` graph execution.
4. API stores tasks/uploads/jobs/analytics/SSO sessions in SQLite (or PostgreSQL-backed orchestrator state).
4. Responses are returned as JSON or SSE streams.

## Provider Support
Configured through `services/api/.env`:
- OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`)
- Ollama (`OLLAMA_BASE_URL`)

## Local Development
### Prerequisites
- Node.js 20+
- pnpm 9+
- Python 3.10+

### Install
```bash
pnpm install
```

### Run Web + API
```bash
pnpm --filter hephaestus-api dev
pnpm --filter hephaestus-web dev
```

### Run AI Service
```bash
cd services/ai
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Environment
### Web
- `NEXT_PUBLIC_API_BASE` - API base URL

Example: `apps/web/.env.local`
```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

### API
Use `services/api/.env.example` as baseline.

Important values:
- `HEPHAESTUS_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_SERVICE_URL`
- `ORCHESTRATOR_URL`
- `SQLITE_DB_PATH` (set to persistent disk path in production, for example `/var/data/hephaestus.db`)
- `ENTERPRISE_SSO_ENABLED`
- `SSO_JWT_SECRET`
- `SAML_ENTRY_POINT`
- `CORS_ALLOWED_ORIGINS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

## Deployment (Render)
The repo includes `render.yaml` for Blueprint deployment.

Services:
- `hephaestus-web`
- `hephaestus-api`
- `hephaestus-ai`
- `hephaestus-orchestrator`

Current configuration targets free-tier constraints.

## Known Free-Tier Constraints
- Persistent disks are not available on Render free web instances
- SQLite data resets after redeploy/restart if no disk is attached
- Video analysis paths requiring system `ffmpeg` may be limited

## Troubleshooting
### `OpenAI response failed`
- Verify `OPENAI_API_KEY` is valid and active.
- Confirm API service uses latest commit in Render.
- Check runtime logs (not deploy logs) in `hephaestus-api`.

### `Cannot GET /`
- Expected on API root URL.
- Use `hephaestus-web` service URL for UI.

### TypeScript build errors in web
- Ensure `typescript` and `@types/react` are installed.
- Redeploy web service after pushing fixes.

## Documentation
- Contribution guide: `CONTRIBUTING.md`
- Roadmap: `ROADMAP.md`
- Deployment guide: `DEPLOY.md`
- License: `LICENSE`

## Enterprise Local Stack
Use `infra/docker/docker-compose.enterprise.yml` for local production-like stack:
- PostgreSQL + pgvector
- Redis
- Neo4j
- Jaeger
- Prometheus + Grafana
- API + AI + Orchestrator services

## Security Notes
- Never commit secrets.
- Rotate any exposed key immediately.
- Use platform secret managers in production.

## License
This project is licensed under the MIT License. See `LICENSE`.
