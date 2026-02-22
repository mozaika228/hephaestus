# Deployment Guide

This project supports Render deployment via `render.yaml`.

## Services
- `hephaestus-web` - Next.js frontend
- `hephaestus-api` - Node.js API
- `hephaestus-ai` - FastAPI analysis service
- `hephaestus-orchestrator` - FastAPI graph orchestrator

## Prerequisites
- Repository connected to Render
- Valid provider secrets in Render environment variables

## Render Blueprint Flow
1. In Render, choose **New + > Blueprint**.
2. Select this repository.
3. Confirm services from `render.yaml`.
4. Add required environment variables.
5. Deploy and verify health endpoints.

## Required Environment Variables
### API (`hephaestus-api`)
- `HEPHAESTUS_PROVIDER`
- `OPENAI_API_KEY` (required for OpenAI provider)
- `OPENAI_MODEL`
- `AI_SERVICE_URL`
- `ORCHESTRATOR_URL`
- `SQLITE_DB_PATH` (production: `/var/data/hephaestus.db`)
- `ENTERPRISE_SSO_ENABLED`
- `SSO_JWT_SECRET`
- `SAML_ENTRY_POINT`
- `CORS_ALLOWED_ORIGINS` (comma-separated allowed web origins)
- `RATE_LIMIT_WINDOW_MS` (example: `60000`)
- `RATE_LIMIT_MAX` (example: `120`)

Optional:
- `AZURE_OPENAI_*`
- `LOCAL_MODEL_ENDPOINT`
- `CUSTOM_PROVIDER_*`

### Web (`hephaestus-web`)
- `NEXT_PUBLIC_API_BASE`

### Orchestrator (`hephaestus-orchestrator`)
- `DATABASE_URL` (PostgreSQL DSN)

## Health Checks
- API: `GET /health`
- AI: `GET /health`

## Troubleshooting
### `OpenAI response failed`
- Verify `OPENAI_API_KEY` in Render.
- Ensure API service is deployed from latest commit.
- Check runtime logs in `hephaestus-api` for `openai_response_not_ok` details.

### `Cannot GET /` on API URL
- Expected behavior. API root has no homepage.
- Use `hephaestus-web` URL for UI.

### Free-Tier Caveats
- Services can sleep when idle.
- Persistent disk is not available for free web instances.
- SQLite resets on redeploy if you do not attach a disk.

## Kubernetes / Helm
- Base manifests: `infra/k8s/`
- Helm chart: `infra/helm/hephaestus/`
