# Hephaestus

Hephaestus is a multi-platform AI assistant (web + desktop + mobile) with a modular backend for chat, file analysis, planning, and integrations.

## Repository Layout
- `apps/web` - Next.js web application
- `apps/desktop` - Electron desktop shell
- `apps/mobile` - Flutter mobile client
- `services/api` - Node.js API (chat, files, planner, integrations)
- `services/ai` - FastAPI service (analysis helpers and jobs)
- `packages/shared` - shared constants and utilities
- `infra` - infrastructure assets

## Core Capabilities
- Chat assistant with streaming responses
- Multi-provider model routing (OpenAI, Azure, local, custom)
- File ingestion and analysis workflows
- Planner tasks and job queue endpoints
- Web/Desktop/Mobile client surfaces

## Architecture
1. Client sends requests to `services/api`.
2. API routes requests to provider adapters or `services/ai`.
3. API stores tasks/uploads/jobs in SQLite (current default).
4. Responses are returned as JSON or SSE streams.

## Provider Support
Configured through `services/api/.env`:
- OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`)
- Azure OpenAI (`AZURE_OPENAI_*`)
- Local endpoint (`LOCAL_MODEL_ENDPOINT`)
- Custom endpoint (`CUSTOM_PROVIDER_*`)

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

## Deployment (Render)
The repo includes `render.yaml` for Blueprint deployment.

Services:
- `hephaestus-web`
- `hephaestus-api`
- `hephaestus-ai`

Current configuration targets free-tier constraints.

## Known Free-Tier Constraints
- No persistent disk in the current free setup
- SQLite data may reset after redeploy/restart
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

## Security Notes
- Never commit secrets.
- Rotate any exposed key immediately.
- Use platform secret managers in production.

## License
This project is licensed under the MIT License. See `LICENSE`.
