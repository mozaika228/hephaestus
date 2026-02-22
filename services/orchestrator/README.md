# Hephaestus Orchestrator

FastAPI-based multi-agent orchestration service with:
- intent routing
- planner/executor/critic/safety/verifier graph
- dynamic sub-agent planning trigger for long context
- verifiable hash chain per step
- PostgreSQL persistence for runs and steps

## Run locally
```bash
cd services/orchestrator
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8100
```

## Environment
- `DATABASE_URL` (optional for local; required for persistence)

## Endpoints
- `GET /health`
- `POST /v1/graph/run`
