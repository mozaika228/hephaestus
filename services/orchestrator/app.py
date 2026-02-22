from __future__ import annotations

import ast
import contextlib
import datetime as dt
import hashlib
import json
import math
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, TypedDict
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import requests
from fastapi import FastAPI
from langgraph.graph import END, START, StateGraph
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from pydantic import BaseModel, Field

app = FastAPI(title="Hephaestus Orchestrator", version="0.2.0")


class GraphRunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    session_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


class KnowledgeIngestRequest(BaseModel):
    content: str = Field(min_length=1)
    document_id: Optional[str] = None
    metadata: Dict[str, Any] = {}
    chunk_size: int = Field(default=700, ge=100, le=2000)
    chunk_overlap: int = Field(default=120, ge=0, le=500)


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)


class OrchestratorState(TypedDict):
    run_id: str
    session_id: str
    prompt: str
    intent: str
    plan: List[Dict[str, Any]]
    sub_agents: List[Dict[str, Any]]
    execution: List[Dict[str, Any]]
    debate: Dict[str, Any]
    verifier_report: Dict[str, Any]
    safety: Dict[str, Any]
    final_answer: str
    steps: List[Dict[str, Any]]
    step_hash: str
    metadata: Dict[str, Any]


FORBIDDEN_PATTERNS = [
    "build bomb",
    "steal password",
    "bypass 2fa",
    "malware",
    "exploit zero-day",
]
MAX_SUBAGENT_DEPTH = int(os.getenv("ORCH_MAX_SUBAGENT_DEPTH", "2"))
MAX_SUBAGENT_CHILDREN = int(os.getenv("ORCH_MAX_SUBAGENT_CHILDREN", "4"))
MAX_EXECUTION_ATTEMPTS = int(os.getenv("ORCH_TOOL_MAX_RETRIES", "2"))
CIRCUIT_FAIL_THRESHOLD = int(os.getenv("ORCH_CIRCUIT_FAIL_THRESHOLD", "3"))
CIRCUIT_RESET_SECONDS = int(os.getenv("ORCH_CIRCUIT_RESET_SECONDS", "60"))
EMBEDDING_DIM = 384
MEMORY_KNOWLEDGE: List[Dict[str, Any]] = []
TRACE_SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "hephaestus-orchestrator")


def setup_tracing() -> None:
    provider = TracerProvider(resource=Resource.create({"service.name": TRACE_SERVICE_NAME}))
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if otlp_endpoint:
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint)))
    else:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)


setup_tracing()
TRACER = trace.get_tracer("hephaestus.orchestrator")


def now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def sha256_json(data: Dict[str, Any], prev_hash: str) -> str:
    blob = json.dumps({"prev": prev_hash, "data": data}, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def append_step(state: OrchestratorState, node: str, payload: Dict[str, Any]) -> None:
    entry = {
        "id": f"step_{uuid4()}",
        "node": node,
        "payload": payload,
        "created_at": now_iso(),
    }
    step_hash = sha256_json(entry, state["step_hash"])
    entry["step_hash"] = step_hash
    state["steps"].append(entry)
    state["step_hash"] = step_hash


@contextlib.contextmanager
def trace_node(name: str, state: OrchestratorState):
    with TRACER.start_as_current_span(f"graph.node.{name}") as span:
        span.set_attribute("run.id", state["run_id"])
        span.set_attribute("session.id", state["session_id"])
        span.set_attribute("graph.intent", state.get("intent", "unknown"))
        request_id = str(state.get("metadata", {}).get("request_id", ""))
        if request_id:
            span.set_attribute("request.id", request_id)
        yield span


def get_conn():
    dsn = os.getenv("DATABASE_URL", "")
    if not dsn:
        return None
    return psycopg.connect(dsn)


def init_db():
    conn = get_conn()
    if conn is None:
        return
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS graph_runs (
                  id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  prompt TEXT NOT NULL,
                  intent TEXT NOT NULL,
                  final_answer TEXT NOT NULL,
                  step_hash TEXT NOT NULL,
                  metadata JSONB NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS graph_steps (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  node TEXT NOT NULL,
                  payload JSONB NOT NULL,
                  step_hash TEXT NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL
                );
                """
            )
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            except Exception:
                pass
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge_chunks (
                  id TEXT PRIMARY KEY,
                  document_id TEXT NOT NULL,
                  chunk_index INTEGER NOT NULL,
                  content TEXT NOT NULL,
                  embedding vector(384),
                  metadata JSONB NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL
                );
                """
            )
            try:
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);"
                )
            except Exception:
                pass
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_keyword ON knowledge_chunks USING GIN (to_tsvector('simple', content));"
            )


def persist_run(state: OrchestratorState):
    conn = get_conn()
    if conn is None:
        return
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO graph_runs (id, session_id, prompt, intent, final_answer, step_hash, metadata, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (
                    state["run_id"],
                    state["session_id"],
                    state["prompt"],
                    state["intent"],
                    state["final_answer"],
                    state["step_hash"],
                    json.dumps(state["metadata"]),
                    now_iso(),
                ),
            )

            for step in state["steps"]:
                cur.execute(
                    """
                    INSERT INTO graph_steps (id, run_id, node, payload, step_hash, created_at)
                    VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                    """,
                    (
                        step["id"],
                        state["run_id"],
                        step["node"],
                        json.dumps(step["payload"]),
                        step["step_hash"],
                        step["created_at"],
                    ),
                )


def tokenize(text: str) -> List[str]:
    return re.findall(r"[a-zA-Z0-9_]+", text.lower())


def embed_text(text: str) -> List[float]:
    vec = [0.0] * EMBEDDING_DIM
    tokens = tokenize(text)
    if not tokens:
        return vec
    for tok in tokens:
        digest = hashlib.sha256(tok.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % EMBEDDING_DIM
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        magnitude = 1.0 + (digest[5] / 255.0)
        vec[idx] += sign * magnitude
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def vector_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


def split_chunks(text: str, chunk_size: int, overlap: int) -> List[str]:
    words = text.split()
    if not words:
        return []
    chunks: List[str] = []
    start = 0
    step = max(1, chunk_size - overlap)
    while start < len(words):
        end = min(len(words), start + chunk_size)
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start += step
    return chunks


def ingest_document_chunks(
    content: str,
    document_id: str,
    metadata: Dict[str, Any],
    chunk_size: int,
    chunk_overlap: int,
) -> Dict[str, Any]:
    chunks = split_chunks(content, chunk_size, chunk_overlap)
    if not chunks:
        return {"document_id": document_id, "ingested": 0, "backend": "none"}

    conn = get_conn()
    created_ids: List[str] = []

    if conn is None:
        for idx, chunk in enumerate(chunks):
            chunk_id = f"chunk_{uuid4()}"
            MEMORY_KNOWLEDGE.append(
                {
                    "id": chunk_id,
                    "document_id": document_id,
                    "chunk_index": idx,
                    "content": chunk,
                    "metadata": metadata,
                    "embedding": embed_text(chunk),
                    "created_at": now_iso(),
                }
            )
            created_ids.append(chunk_id)
        return {"document_id": document_id, "ingested": len(created_ids), "backend": "memory"}

    with conn:
        with conn.cursor() as cur:
            for idx, chunk in enumerate(chunks):
                chunk_id = f"chunk_{uuid4()}"
                cur.execute(
                    """
                    INSERT INTO knowledge_chunks (id, document_id, chunk_index, content, embedding, metadata, created_at)
                    VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, %s)
                    """,
                    (
                        chunk_id,
                        document_id,
                        idx,
                        chunk,
                        vector_literal(embed_text(chunk)),
                        json.dumps(metadata),
                        now_iso(),
                    ),
                )
                created_ids.append(chunk_id)
    return {"document_id": document_id, "ingested": len(created_ids), "backend": "postgres"}


def hybrid_search(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    conn = get_conn()
    query_embedding = embed_text(query)

    if conn is None:
        semantic = sorted(
            MEMORY_KNOWLEDGE,
            key=lambda item: cosine_similarity(query_embedding, item["embedding"]),
            reverse=True,
        )[:top_k]
        keyword_tokens = set(tokenize(query))

        def kw_score(item: Dict[str, Any]) -> int:
            words = tokenize(item["content"])
            return sum(1 for word in words if word in keyword_tokens)

        keyword = sorted(MEMORY_KNOWLEDGE, key=kw_score, reverse=True)[:top_k]
        return fuse_results(semantic, keyword, top_k)

    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, document_id, chunk_index, content, metadata, (1 - (embedding <=> %s::vector)) AS score
                FROM knowledge_chunks
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (vector_literal(query_embedding), vector_literal(query_embedding), top_k),
            )
            semantic_rows = cur.fetchall()

            cur.execute(
                """
                SELECT id, document_id, chunk_index, content, metadata,
                       ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', %s)) AS score
                FROM knowledge_chunks
                WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', %s)
                ORDER BY score DESC
                LIMIT %s
                """,
                (query, query, top_k),
            )
            keyword_rows = cur.fetchall()

    semantic = [
        {
            "id": row[0],
            "document_id": row[1],
            "chunk_index": row[2],
            "content": row[3],
            "metadata": row[4] or {},
            "score": float(row[5] or 0.0),
        }
        for row in semantic_rows
    ]
    keyword = [
        {
            "id": row[0],
            "document_id": row[1],
            "chunk_index": row[2],
            "content": row[3],
            "metadata": row[4] or {},
            "score": float(row[5] or 0.0),
        }
        for row in keyword_rows
    ]
    return fuse_results(semantic, keyword, top_k)


def fuse_results(semantic: List[Dict[str, Any]], keyword: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    rrf_scores: Dict[str, float] = {}
    items: Dict[str, Dict[str, Any]] = {}
    k = 60.0

    for rank, item in enumerate(semantic, start=1):
        item_id = item["id"]
        items[item_id] = item
        rrf_scores[item_id] = rrf_scores.get(item_id, 0.0) + 1.0 / (k + rank)

    for rank, item in enumerate(keyword, start=1):
        item_id = item["id"]
        items[item_id] = item
        rrf_scores[item_id] = rrf_scores.get(item_id, 0.0) + 1.0 / (k + rank)

    ranked = sorted(rrf_scores.items(), key=lambda kv: kv[1], reverse=True)[:top_k]
    return [{**items[item_id], "hybrid_score": score} for item_id, score in ranked]


@dataclass
class CircuitBreaker:
    fail_count: int = 0
    opened_at: float = 0.0

    def is_open(self) -> bool:
        if self.fail_count < CIRCUIT_FAIL_THRESHOLD:
            return False
        if time.time() - self.opened_at >= CIRCUIT_RESET_SECONDS:
            self.fail_count = 0
            self.opened_at = 0.0
            return False
        return True

    def on_failure(self):
        self.fail_count += 1
        if self.fail_count >= CIRCUIT_FAIL_THRESHOLD:
            self.opened_at = time.time()

    def on_success(self):
        self.fail_count = 0
        self.opened_at = 0.0


CIRCUITS: Dict[str, CircuitBreaker] = {}


def allowed_hosts() -> List[str]:
    raw = os.getenv("ORCH_HTTP_ALLOWLIST", "")
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


def safe_eval_expression(expr: str) -> str:
    tree = ast.parse(expr, mode="eval")
    allowed_nodes = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Constant,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Mod,
        ast.Pow,
        ast.USub,
        ast.UAdd,
        ast.FloorDiv,
    )
    for node in ast.walk(tree):
        if not isinstance(node, allowed_nodes):
            raise ValueError("Expression contains forbidden syntax.")
    result = eval(compile(tree, "<expr>", "eval"), {"__builtins__": {}}, {})
    return str(result)


def tool_web_search(args: Dict[str, Any]) -> Dict[str, Any]:
    query = str(args.get("query", "")).strip()
    if not query:
        raise ValueError("query is required")
    return {
        "tool": "web_search",
        "status": "ok",
        "result": f"Search results prepared for query: {query}",
        "sources": [],
    }


def tool_kb_search(args: Dict[str, Any]) -> Dict[str, Any]:
    query = str(args.get("query", "")).strip()
    top_k = int(args.get("top_k", 5))
    if not query:
        raise ValueError("query is required")
    results = hybrid_search(query, top_k=top_k)
    return {
        "tool": "kb_search",
        "status": "ok",
        "result": f"KB search completed for: {query}. Found {len(results)} chunks.",
        "chunks": results,
    }


def tool_http_fetch(args: Dict[str, Any]) -> Dict[str, Any]:
    url = str(args.get("url", "")).strip()
    if not url:
        raise ValueError("url is required")
    host = (urlparse(url).hostname or "").lower()
    allowlist = allowed_hosts()
    if allowlist and host not in allowlist:
        raise ValueError(f"host not allowed: {host}")
    resp = requests.get(url, timeout=8)
    return {
        "tool": "http_fetch",
        "status": "ok",
        "result": f"HTTP {resp.status_code}",
        "length": len(resp.text),
    }


def tool_code_exec_sandboxed(args: Dict[str, Any]) -> Dict[str, Any]:
    expr = str(args.get("expression", "")).strip()
    if not expr:
        raise ValueError("expression is required")
    return {
        "tool": "code_exec_sandboxed",
        "status": "ok",
        "result": safe_eval_expression(expr),
    }


TOOLS = {
    "web_search": tool_web_search,
    "kb_search": tool_kb_search,
    "http_fetch": tool_http_fetch,
    "code_exec_sandboxed": tool_code_exec_sandboxed,
}


def execute_tool_with_resilience(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"tool": name, "status": "error", "error": "unknown_tool"}

    circuit = CIRCUITS.setdefault(name, CircuitBreaker())
    if circuit.is_open():
        return {"tool": name, "status": "error", "error": "circuit_open"}

    last_error = ""
    for attempt in range(1, MAX_EXECUTION_ATTEMPTS + 1):
        with TRACER.start_as_current_span("tool.execute") as span:
            span.set_attribute("tool.name", name)
            span.set_attribute("tool.attempt", attempt)
            try:
                output = tool(args)
                output["attempt"] = attempt
                circuit.on_success()
                span.set_attribute("tool.status", "ok")
                return output
            except Exception as exc:
                last_error = str(exc)
                circuit.on_failure()
                span.set_attribute("tool.status", "error")
                span.set_attribute("tool.error", last_error)
                if attempt < MAX_EXECUTION_ATTEMPTS:
                    time.sleep(0.2 * attempt)

    return {
        "tool": name,
        "status": "error",
        "error": last_error or "execution_failed",
        "attempt": MAX_EXECUTION_ATTEMPTS,
    }


def node_intent_router(state: OrchestratorState) -> OrchestratorState:
    with trace_node("intent_router", state) as span:
        text = state["prompt"].lower()
        intent = "general"
        if any(k in text for k in ["file", "image", "audio", "video"]):
            intent = "multimodal_rag"
        elif any(k in text for k in ["plan", "roadmap", "milestone"]):
            intent = "planning"
        elif any(k in text for k in ["compare", "verify", "fact check"]):
            intent = "research"
        state["intent"] = intent
        span.set_attribute("graph.intent", intent)
        append_step(state, "intent_router", {"intent": intent})
    return state


def node_planner(state: OrchestratorState) -> OrchestratorState:
    with trace_node("planner", state) as span:
        plan = [
            {"task": "understand_request", "agent": "planner", "status": "done"},
            {"task": "collect_context", "agent": "researcher", "status": "queued"},
            {"task": "execute_tools", "agent": "executor", "status": "queued"},
            {"task": "critic_review", "agent": "critic", "status": "queued"},
        ]

        depth = int(state["metadata"].get("depth", 0))
        budget = int(state["metadata"].get("spawn_budget", MAX_SUBAGENT_CHILDREN))
        if len(state["prompt"]) > 200 and depth < MAX_SUBAGENT_DEPTH and budget > 0:
            sub_count = min(2, budget, MAX_SUBAGENT_CHILDREN)
            sub_agents = [
                {"id": f"sub_{i+1}", "role": "planner.subagent", "depth": depth + 1}
                for i in range(sub_count)
            ]
            state["sub_agents"] = sub_agents
            plan.append({"task": "spawn_sub_agents", "agent": "planner", "status": "done", "count": sub_count})
        else:
            state["sub_agents"] = []

        state["plan"] = plan
        span.set_attribute("planner.sub_agents", len(state["sub_agents"]))
        append_step(state, "planner", {"plan": plan, "sub_agents": state["sub_agents"]})
    return state


def node_researcher(state: OrchestratorState) -> OrchestratorState:
    with trace_node("researcher", state) as span:
        result = execute_tool_with_resilience("kb_search", {"query": state["prompt"]})
        state["execution"].append({"phase": "researcher", **result})
        span.set_attribute("researcher.status", result.get("status", "unknown"))
        append_step(state, "researcher", {"result": result})
    return state


def node_executor(state: OrchestratorState) -> OrchestratorState:
    with trace_node("executor", state):
        tool_runs = [
            execute_tool_with_resilience("web_search", {"query": state["prompt"]}),
            execute_tool_with_resilience("code_exec_sandboxed", {"expression": "2+2*10"}),
        ]
        state["execution"].extend([{"phase": "executor", **item} for item in tool_runs])
        append_step(state, "executor", {"execution": tool_runs})
    return state


def node_critic_debate(state: OrchestratorState) -> OrchestratorState:
    with trace_node("critic", state):
        success_count = len([item for item in state["execution"] if item.get("status") == "ok"])
        failure_count = len([item for item in state["execution"] if item.get("status") != "ok"])
        vote = "pro" if success_count >= failure_count else "con"
        confidence = 0.8 if vote == "pro" else 0.45
        state["debate"] = {
            "claim": "Execution output is adequate for next-step synthesis.",
            "evidence": {
                "tool_success_count": success_count,
                "tool_failure_count": failure_count,
            },
            "risk": "Some outputs may be synthetic and require stronger source verification.",
            "decision": vote,
            "confidence": confidence,
            "arguments": {
                "pro": "Execution produced usable evidence and tool outputs.",
                "con": "External evidence confidence is medium and needs stronger citations.",
            },
        }
        append_step(state, "critic", state["debate"])
    return state


def node_safety(state: OrchestratorState) -> OrchestratorState:
    with trace_node("safety", state):
        text = state["prompt"].lower()
        violations = [pattern for pattern in FORBIDDEN_PATTERNS if pattern in text]
        state["safety"] = {"allowed": len(violations) == 0, "violations": violations}
        append_step(state, "safety", state["safety"])
    return state


def node_verifier(state: OrchestratorState) -> OrchestratorState:
    with trace_node("verifier", state):
        if not state["safety"].get("allowed", True):
            decision = "blocked"
            final_answer = "Request blocked by constitutional safety policy."
            confidence = 1.0
        else:
            decision = "approved"
            confidence = float(state["debate"].get("confidence", 0.0))
            final_answer = (
                f"Intent={state['intent']}. "
                f"PlanTasks={len(state['plan'])}. "
                f"SubAgents={len(state['sub_agents'])}. "
                f"DebateDecision={state['debate'].get('decision', 'n/a')} "
                f"Confidence={confidence}."
            )
        state["verifier_report"] = {
            "decision": decision,
            "confidence": confidence,
            "policy_checks": state["safety"],
            "requires_human_review": confidence < 0.6,
        }
        state["final_answer"] = final_answer
        append_step(state, "verifier", {"final_answer": final_answer, "report": state["verifier_report"]})
    return state


def build_graph():
    graph = StateGraph(OrchestratorState)
    graph.add_node("intent_router", node_intent_router)
    graph.add_node("planner", node_planner)
    graph.add_node("researcher", node_researcher)
    graph.add_node("executor", node_executor)
    graph.add_node("critic", node_critic_debate)
    graph.add_node("safety", node_safety)
    graph.add_node("verifier", node_verifier)

    graph.add_edge(START, "intent_router")
    graph.add_edge("intent_router", "planner")
    graph.add_edge("planner", "researcher")
    graph.add_edge("researcher", "executor")
    graph.add_edge("executor", "critic")
    graph.add_edge("critic", "safety")
    graph.add_edge("safety", "verifier")
    graph.add_edge("verifier", END)
    return graph.compile()


GRAPH = build_graph()


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    kb_backend = "postgres" if bool(os.getenv("DATABASE_URL", "")) else "memory"
    return {
        "status": "ok",
        "service": "orchestrator",
        "db_configured": bool(os.getenv("DATABASE_URL", "")),
        "langgraph": "enabled",
        "knowledge_backend": kb_backend,
    }


@app.post("/v1/knowledge/ingest")
def knowledge_ingest(req: KnowledgeIngestRequest):
    document_id = req.document_id or f"doc_{uuid4()}"
    result = ingest_document_chunks(
        content=req.content,
        document_id=document_id,
        metadata=req.metadata,
        chunk_size=req.chunk_size,
        chunk_overlap=req.chunk_overlap,
    )
    return {"ok": True, **result}


@app.post("/v1/knowledge/search")
def knowledge_search(req: KnowledgeSearchRequest):
    results = hybrid_search(req.query, req.top_k)
    return {"ok": True, "query": req.query, "results": results, "count": len(results)}


@app.post("/v1/graph/run")
def run_graph(req: GraphRunRequest):
    initial_state: OrchestratorState = {
        "run_id": f"run_{uuid4()}",
        "session_id": req.session_id or f"session_{uuid4()}",
        "prompt": req.prompt,
        "intent": "general",
        "plan": [],
        "sub_agents": [],
        "execution": [],
        "debate": {},
        "verifier_report": {},
        "safety": {},
        "final_answer": "",
        "steps": [],
        "step_hash": "genesis",
        "metadata": req.metadata,
    }

    final_state = GRAPH.invoke(initial_state)
    persist_run(final_state)

    return {
        "ok": True,
        "run_id": final_state["run_id"],
        "session_id": final_state["session_id"],
        "intent": final_state["intent"],
        "final_answer": final_state["final_answer"],
        "safety": final_state["safety"],
        "debate": final_state["debate"],
        "verifier_report": final_state["verifier_report"],
        "step_hash": final_state["step_hash"],
        "steps": final_state["steps"],
        "execution": final_state["execution"],
        "sub_agents": final_state["sub_agents"],
    }
