from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional, Callable
from uuid import uuid4
import datetime as dt
import hashlib
import json
import os

import psycopg

app = FastAPI(title="Hephaestus Orchestrator", version="0.1.0")


class GraphRunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    session_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


class GraphState(BaseModel):
    run_id: str
    session_id: str
    prompt: str
    intent: str = "general"
    plan: List[Dict[str, Any]] = []
    execution: List[Dict[str, Any]] = []
    debate: Dict[str, Any] = {}
    safety: Dict[str, Any] = {}
    final_answer: str = ""
    steps: List[Dict[str, Any]] = []
    step_hash: str = "genesis"
    metadata: Dict[str, Any] = {}


FORBIDDEN_PATTERNS = [
    "build bomb",
    "steal password",
    "bypass 2fa",
    "malware",
    "exploit zero-day",
]


def now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def sha256_json(data: Dict[str, Any], prev_hash: str) -> str:
    blob = json.dumps({"prev": prev_hash, "data": data}, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


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


@app.on_event("startup")
def on_startup():
    init_db()


def append_step(state: GraphState, node: str, payload: Dict[str, Any]):
    entry = {
        "id": f"step_{uuid4()}",
        "node": node,
        "payload": payload,
        "created_at": now_iso(),
    }
    step_hash = sha256_json(entry, state.step_hash)
    entry["step_hash"] = step_hash
    state.steps.append(entry)
    state.step_hash = step_hash


def node_intent_router(state: GraphState) -> GraphState:
    text = state.prompt.lower()
    intent = "general"
    if any(k in text for k in ["file", "image", "audio", "video"]):
        intent = "multimodal_rag"
    elif any(k in text for k in ["plan", "roadmap", "milestone"]):
        intent = "planning"
    elif any(k in text for k in ["compare", "verify", "fact check"]):
        intent = "research"
    state.intent = intent
    append_step(state, "intent_router", {"intent": intent})
    return state


def node_planner(state: GraphState) -> GraphState:
    plan = [
        {"task": "understand_request", "agent": "planner", "status": "done"},
        {"task": "collect_context", "agent": "researcher", "status": "queued"},
        {"task": "execute_tools", "agent": "executor", "status": "queued"},
        {"task": "critic_review", "agent": "critic", "status": "queued"},
    ]
    if len(state.prompt) > 200:
        plan.append({"task": "spawn_sub_agent_long_context", "agent": "planner.subagent", "status": "queued"})
    state.plan = plan
    append_step(state, "planner", {"plan": plan})
    return state


def node_executor(state: GraphState) -> GraphState:
    outputs = [
        {"tool": "local_rag", "status": "ok", "result": "Context retrieved from indexed knowledge base."},
        {"tool": "web_search", "status": "ok", "result": "External sources queued for optional verification."},
    ]
    state.execution = outputs
    append_step(state, "executor", {"execution": outputs})
    return state


def node_critic_debate(state: GraphState) -> GraphState:
    pro = "The plan covers retrieval, execution, and verification."
    con = "External evidence confidence is medium and needs references."
    vote = "pro" if len(state.execution) >= 1 else "con"
    confidence = 0.78 if vote == "pro" else 0.42
    state.debate = {"pro": pro, "con": con, "vote": vote, "confidence": confidence}
    append_step(state, "critic", state.debate)
    return state


def node_safety(state: GraphState) -> GraphState:
    text = state.prompt.lower()
    violations = [pattern for pattern in FORBIDDEN_PATTERNS if pattern in text]
    allowed = len(violations) == 0
    state.safety = {"allowed": allowed, "violations": violations}
    append_step(state, "safety", state.safety)
    return state


def node_verifier(state: GraphState) -> GraphState:
    if not state.safety.get("allowed", True):
        state.final_answer = "Request blocked by constitutional safety policy."
    else:
        state.final_answer = (
            f"Intent={state.intent}. Plan tasks={len(state.plan)}. "
            f"Debate vote={state.debate.get('vote', 'n/a')} confidence={state.debate.get('confidence', 0)}. "
            "Execution completed with verifiable step hash chain."
        )
    append_step(state, "verifier", {"final_answer": state.final_answer})
    return state


GRAPH_NODES: List[Callable[[GraphState], GraphState]] = [
    node_intent_router,
    node_planner,
    node_executor,
    node_critic_debate,
    node_safety,
    node_verifier,
]


def persist_run(state: GraphState):
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
                    state.run_id,
                    state.session_id,
                    state.prompt,
                    state.intent,
                    state.final_answer,
                    state.step_hash,
                    json.dumps(state.metadata),
                    now_iso(),
                ),
            )

            for step in state.steps:
                cur.execute(
                    """
                    INSERT INTO graph_steps (id, run_id, node, payload, step_hash, created_at)
                    VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                    """,
                    (
                        step["id"],
                        state.run_id,
                        step["node"],
                        json.dumps(step["payload"]),
                        step["step_hash"],
                        step["created_at"],
                    ),
                )


@app.get("/health")
def health():
    db_ready = bool(os.getenv("DATABASE_URL", ""))
    return {"status": "ok", "service": "orchestrator", "db_configured": db_ready}


@app.post("/v1/graph/run")
def run_graph(req: GraphRunRequest):
    state = GraphState(
        run_id=f"run_{uuid4()}",
        session_id=req.session_id or f"session_{uuid4()}",
        prompt=req.prompt,
        metadata=req.metadata,
    )

    for node in GRAPH_NODES:
        state = node(state)

    persist_run(state)

    return {
        "ok": True,
        "run_id": state.run_id,
        "session_id": state.session_id,
        "intent": state.intent,
        "final_answer": state.final_answer,
        "safety": state.safety,
        "debate": state.debate,
        "step_hash": state.step_hash,
        "steps": state.steps,
    }
