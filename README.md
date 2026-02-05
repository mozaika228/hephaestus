# Hephaestus

Multi-platform AI assistant (web + desktop + mobile) with a techno-cyber identity and a modular backend for chat, file analysis, planning, and integrations.

## Structure
- `apps/web` – Next.js web app
- `apps/desktop` – Electron desktop app
- `apps/mobile` – Flutter app
- `services/api` – Node.js API (auth, chat, planner, integrations)
- `services/ai` – Python AI service (file analysis, embeddings, pipelines)
- `packages/shared` – shared types, prompts, and utilities
- `infra` – infrastructure assets (docker, deployment)

## Providers
The API supports OpenAI, Azure OpenAI, local models, and custom providers. Configure them in `services/api/.env` based on `services/api/.env.example`.

## Quick start (dev)
1. `pnpm install`
2. `pnpm --filter hephaestus-web dev`
3. `pnpm --filter hephaestus-api dev`

The web app reads `NEXT_PUBLIC_API_BASE` (see `apps/web/.env.example`).

## Notes
This repo is an MVP scaffold. Platform apps and services will be wired together after initial UI and API skeletons are in place.
