# Hephaestus Orchestrator

FastAPI-based multi-agent orchestration service with:
- intent routing
- LangGraph state graph (`intent_router -> planner -> researcher -> executor -> critic -> safety -> verifier`)
- dynamic sub-agent planning trigger for long context
- verifiable hash chain per step
- PostgreSQL persistence for runs and steps
- Tool registry with retry and circuit-breaker (`web_search`, `kb_search`, `http_fetch`, `code_exec_sandboxed`)

## Run locally
```bash
cd services/orchestrator
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8100
```

## Environment
- `DATABASE_URL` (optional for local; required for persistence)
- `ORCH_HTTP_ALLOWLIST` (comma-separated hosts for `http_fetch`)
- `ORCH_MAX_SUBAGENT_DEPTH`
- `ORCH_MAX_SUBAGENT_CHILDREN`
- `ORCH_TOOL_MAX_RETRIES`
- `ORCH_CIRCUIT_FAIL_THRESHOLD`
- `ORCH_CIRCUIT_RESET_SECONDS`

## Endpoints
- `GET /health`
- `POST /v1/graph/run`
