from fastapi import FastAPI, UploadFile
from pydantic import BaseModel
from typing import Optional, Dict, List
from uuid import uuid4
import hashlib
import os

app = FastAPI(title="Hephaestus AI Service")

JOBS = {}
KNOWN_PROVIDERS = ["openai", "azure", "local", "custom"]
INTENTS: Dict[str, List[str]] = {
    "chat": ["hello", "hi", "привет", "здарова", "сәлем"],
    "code": ["code", "bug", "refactor", "function", "api", "код", "ошибка"],
    "planner": ["plan", "task", "schedule", "todo", "план", "задача", "распис"],
    "integration": ["slack", "notion", "google", "integration", "интегра"],
    "file_analysis": ["file", "image", "audio", "video", "analyze", "файл", "анализ", "аудио", "видео"]
}
INTENT_PREFERENCE = {
    "chat": ["openai", "azure", "local", "custom"],
    "code": ["openai", "azure", "local", "custom"],
    "planner": ["openai", "azure", "local", "custom"],
    "integration": ["custom", "openai", "azure", "local"],
    "file_analysis": ["openai", "azure", "custom", "local"],
    "file_analysis_image": ["openai", "azure", "custom", "local"],
    "file_analysis_audio": ["openai", "azure"],
    "file_analysis_video": ["openai", "azure", "custom"],
    "file_analysis_document": ["openai", "azure", "custom", "local"]
}


class LogicProviders(BaseModel):
    openaiConfigured: bool = False
    azureConfigured: bool = False
    localConfigured: bool = False
    customConfigured: bool = False


class LogicDecisionRequest(BaseModel):
    mode: str = "chat"
    message: Optional[str] = None
    fileId: Optional[str] = None
    mime: Optional[str] = None
    intentHint: Optional[str] = None
    requestedProvider: Optional[str] = None
    configuredProvider: Optional[str] = "openai"
    providers: LogicProviders


def hash_file(path: str) -> Optional[str]:
    try:
        sha = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha.update(chunk)
        return sha.hexdigest()
    except Exception:
        return None


def _score_intent(message: str, words: List[str]) -> int:
    score = 0
    for word in words:
        if word in message:
            score += 1
    return score


def _route_chat_intent(message: str, file_id: Optional[str]):
    if file_id:
        return {"intent": "file_analysis", "confidence": 1, "reason": "file_id_present"}

    text = (message or "").lower()
    best_intent = "chat"
    best_score = 0
    for intent, words in INTENTS.items():
        current = _score_intent(text, words)
        if current > best_score:
            best_score = current
            best_intent = intent

    if best_score == 0:
        return {"intent": "chat", "confidence": 0.35, "reason": "default_chat"}

    confidence = min(0.95, 0.4 + best_score * 0.2)
    return {"intent": best_intent, "confidence": confidence, "reason": "keyword_match"}


def _route_file_intent(mime: str):
    if mime.startswith("image/"):
        return {"intent": "file_analysis_image", "confidence": 0.95, "reason": "mime_image"}
    if mime.startswith("audio/"):
        return {"intent": "file_analysis_audio", "confidence": 0.95, "reason": "mime_audio"}
    if mime.startswith("video/"):
        return {"intent": "file_analysis_video", "confidence": 0.95, "reason": "mime_video"}
    return {"intent": "file_analysis_document", "confidence": 0.8, "reason": "mime_generic"}


def _get_available_providers(providers: LogicProviders):
    available = []
    if providers.openaiConfigured:
        available.append("openai")
    if providers.azureConfigured:
        available.append("azure")
    if providers.localConfigured:
        available.append("local")
    if providers.customConfigured:
        available.append("custom")
    return available


def _resolve_provider_policy(providers: LogicProviders, intent: str, requested_provider: Optional[str], configured_provider: Optional[str]):
    available = _get_available_providers(providers)
    requested = (requested_provider or "").lower()
    configured = (configured_provider or "openai").lower()

    if requested and requested in KNOWN_PROVIDERS and requested in available:
        return {
            "provider": requested,
            "fallbackProviders": [item for item in available if item != requested],
            "availableProviders": available,
            "reason": "requested_provider_available"
        }

    if configured in available:
        return {
            "provider": configured,
            "fallbackProviders": [item for item in available if item != configured],
            "availableProviders": available,
            "reason": "requested_provider_unavailable_use_configured" if requested else "configured_provider_available"
        }

    preferred = INTENT_PREFERENCE.get(intent, INTENT_PREFERENCE["chat"])
    picked = next((item for item in preferred if item in available), None)
    if picked:
        return {
            "provider": picked,
            "fallbackProviders": [item for item in available if item != picked],
            "availableProviders": available,
            "reason": "intent_policy_selected"
        }

    return {
        "provider": configured,
        "fallbackProviders": [],
        "availableProviders": [],
        "reason": "no_provider_available"
    }


@app.get("/health")
async def health():
    return {"status": "Hephaestus AI online"}


@app.post("/logic/decision")
async def logic_decision(req: LogicDecisionRequest):
    mode = (req.mode or "chat").lower()
    if mode == "file":
        route = _route_file_intent(req.mime or "")
    else:
        route = _route_chat_intent(req.message or "", req.fileId)

    intent = req.intentHint or route["intent"]
    policy = _resolve_provider_policy(req.providers, intent, req.requestedProvider, req.configuredProvider)
    return {
        "status": "ok",
        "route": route,
        "policy": policy
    }


@app.post("/analyze")
async def analyze(path: str, name: Optional[str] = None, mime: Optional[str] = None, size: Optional[int] = None):
    metadata = {
        "name": name,
        "mime": mime,
        "size": size,
        "exists": os.path.exists(path),
        "sha256": hash_file(path) if path else None
    }
    return {"status": "ok", "metadata": metadata}


@app.post("/jobs")
async def create_job(kind: str, path: Optional[str] = None):
    job_id = f"job_{uuid4()}"
    JOBS[job_id] = {
        "id": job_id,
        "kind": kind,
        "path": path,
        "status": "queued"
    }
    return {"status": "queued", "job": JOBS[job_id]}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return {"status": "missing"}
    return {"status": "ok", "job": job}


@app.post("/transcribe")
async def transcribe(file: UploadFile):
    return {
        "status": "queued",
        "filename": file.filename,
        "message": "Audio transcription placeholder"
    }


@app.post("/vision")
async def vision(file: UploadFile):
    return {
        "status": "queued",
        "filename": file.filename,
        "message": "Image analysis placeholder"
    }


@app.post("/video")
async def video(file: UploadFile):
    return {
        "status": "queued",
        "filename": file.filename,
        "message": "Video analysis placeholder"
    }
