# Hephaestus Orchestrator

FastAPI-based multi-agent orchestration service with:
- intent routing
- LangGraph state graph (`intent_router -> planner -> researcher -> executor -> critic -> safety -> verifier`)
- dynamic sub-agent planning trigger for long context
- verifiable hash chain per step
- PostgreSQL persistence for runs and steps
- Hybrid retrieval: keyword + semantic search with pgvector (memory fallback when DB is absent)
- Tool registry with retry and circuit-breaker (`web_search`, `kb_search`, `http_fetch`, `code_exec_sandboxed`)
- Debate + verifier reports with structured schema (`claim/evidence/risk/decision/confidence`)
- OpenTelemetry tracing for graph nodes and tool calls

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
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `ORCH_TRACE_TO_CONSOLE` (set `true` to print spans locally)

## Endpoints
- `GET /health`
- `GET /metrics`
- `POST /v1/graph/run`
- `POST /v1/knowledge/ingest`
- `POST /v1/knowledge/search`

