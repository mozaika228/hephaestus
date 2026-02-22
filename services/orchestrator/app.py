from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, TypedDict
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import requests
from fastapi import FastAPI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

app = FastAPI(title="Hephaestus Orchestrator", version="0.2.0")


class GraphRunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    session_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


class OrchestratorState(TypedDict):
    run_id: str
    session_id: str
    prompt: str
    intent: str
    plan: List[Dict[str, Any]]
    sub_agents: List[Dict[str, Any]]
    execution: List[Dict[str, Any]]
    debate: Dict[str, Any]
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
    return {
        "tool": "kb_search",
        "status": "ok",
        "result": f"KB search completed for: {query}",
        "chunks": [],
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
        try:
            output = tool(args)
            output["attempt"] = attempt
            circuit.on_success()
            return output
        except Exception as exc:
            last_error = str(exc)
            circuit.on_failure()
            if attempt < MAX_EXECUTION_ATTEMPTS:
                time.sleep(0.2 * attempt)

    return {
        "tool": name,
        "status": "error",
        "error": last_error or "execution_failed",
        "attempt": MAX_EXECUTION_ATTEMPTS,
    }


def node_intent_router(state: OrchestratorState) -> OrchestratorState:
    text = state["prompt"].lower()
    intent = "general"
    if any(k in text for k in ["file", "image", "audio", "video"]):
        intent = "multimodal_rag"
    elif any(k in text for k in ["plan", "roadmap", "milestone"]):
        intent = "planning"
    elif any(k in text for k in ["compare", "verify", "fact check"]):
        intent = "research"
    state["intent"] = intent
    append_step(state, "intent_router", {"intent": intent})
    return state


def node_planner(state: OrchestratorState) -> OrchestratorState:
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
    append_step(state, "planner", {"plan": plan, "sub_agents": state["sub_agents"]})
    return state


def node_researcher(state: OrchestratorState) -> OrchestratorState:
    result = execute_tool_with_resilience("kb_search", {"query": state["prompt"]})
    state["execution"].append({"phase": "researcher", **result})
    append_step(state, "researcher", {"result": result})
    return state


def node_executor(state: OrchestratorState) -> OrchestratorState:
    tool_runs = [
        execute_tool_with_resilience("web_search", {"query": state["prompt"]}),
        execute_tool_with_resilience("code_exec_sandboxed", {"expression": "2+2*10"}),
    ]
    state["execution"].extend([{"phase": "executor", **item} for item in tool_runs])
    append_step(state, "executor", {"execution": tool_runs})
    return state


def node_critic_debate(state: OrchestratorState) -> OrchestratorState:
    success_count = len([item for item in state["execution"] if item.get("status") == "ok"])
    failure_count = len([item for item in state["execution"] if item.get("status") != "ok"])
    pro = "Execution produced usable evidence and tool outputs."
    con = "Some outputs may be synthetic and require stronger source verification."
    vote = "pro" if success_count >= failure_count else "con"
    confidence = 0.8 if vote == "pro" else 0.45
    state["debate"] = {
        "pro": pro,
        "con": con,
        "vote": vote,
        "confidence": confidence,
        "success_count": success_count,
        "failure_count": failure_count,
    }
    append_step(state, "critic", state["debate"])
    return state


def node_safety(state: OrchestratorState) -> OrchestratorState:
    text = state["prompt"].lower()
    violations = [pattern for pattern in FORBIDDEN_PATTERNS if pattern in text]
    state["safety"] = {"allowed": len(violations) == 0, "violations": violations}
    append_step(state, "safety", state["safety"])
    return state


def node_verifier(state: OrchestratorState) -> OrchestratorState:
    if not state["safety"].get("allowed", True):
        final_answer = "Request blocked by constitutional safety policy."
    else:
        final_answer = (
            f"Intent={state['intent']}. "
            f"PlanTasks={len(state['plan'])}. "
            f"SubAgents={len(state['sub_agents'])}. "
            f"DebateVote={state['debate'].get('vote', 'n/a')} "
            f"Confidence={state['debate'].get('confidence', 0)}."
        )
    state["final_answer"] = final_answer
    append_step(state, "verifier", {"final_answer": final_answer})
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
    return {
        "status": "ok",
        "service": "orchestrator",
        "db_configured": bool(os.getenv("DATABASE_URL", "")),
        "langgraph": "enabled",
    }


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
        "step_hash": final_state["step_hash"],
        "steps": final_state["steps"],
        "execution": final_state["execution"],
        "sub_agents": final_state["sub_agents"],
    }
