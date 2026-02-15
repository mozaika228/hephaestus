from fastapi import FastAPI, UploadFile
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from uuid import uuid4
import base64
import hashlib
import json
import mimetypes
import os
import subprocess
import requests

app = FastAPI(title="Hephaestus AI Service")

JOBS = {}
KNOWN_PROVIDERS = ["openai", "azure", "local", "custom"]
INTENTS: Dict[str, List[str]] = {
    "chat": ["hello", "hi", "privet", "zdarova", "salam"],
    "code": ["code", "bug", "refactor", "function", "api"],
    "planner": ["plan", "task", "schedule", "todo"],
    "integration": ["slack", "notion", "google", "integration"],
    "file_analysis": ["file", "image", "audio", "video", "analyze"]
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

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"


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


class AnalyzeRecord(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    size: Optional[int] = None
    providerFileId: Optional[str] = None
    localPath: Optional[str] = None


class AnalyzeConfig(BaseModel):
    provider: Optional[str] = "openai"
    openaiApiKey: Optional[str] = ""
    openaiModel: Optional[str] = "gpt-4o-mini"
    openaiAnalysisModel: Optional[str] = ""
    openaiTranscribeModel: Optional[str] = "gpt-4o-mini-transcribe"
    instructions: Optional[str] = ""
    azureApiKey: Optional[str] = ""
    azureEndpoint: Optional[str] = ""
    azureDeployment: Optional[str] = ""
    azureApiVersion: Optional[str] = ""
    localEndpoint: Optional[str] = ""
    customEndpoint: Optional[str] = ""
    customAuthHeader: Optional[str] = ""
    customAuthValue: Optional[str] = ""


class AnalyzeRequest(BaseModel):
    record: Optional[AnalyzeRecord] = None
    config: Optional[AnalyzeConfig] = None
    path: Optional[str] = None
    name: Optional[str] = None
    mime: Optional[str] = None
    size: Optional[int] = None


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


def _extract_text_from_response(payload: Dict[str, Any]) -> str:
    output = payload.get("output", [])
    parts: List[str] = []
    for item in output:
        if item.get("type") != "message":
            continue
        for chunk in item.get("content", []):
            if chunk.get("type") == "output_text":
                parts.append(chunk.get("text", ""))
    return "".join(parts).strip()


def _openai_responses(config: AnalyzeConfig, input_payload: List[Dict[str, Any]], instructions: Optional[str] = None):
    if not config.openaiApiKey:
        return {"ok": False, "error": "OpenAI API key is missing."}

    body = {
        "model": config.openaiAnalysisModel or config.openaiModel or "gpt-4o-mini",
        "input": input_payload,
        "instructions": instructions or config.instructions or "",
        "stream": False
    }
    headers = {
        "Authorization": f"Bearer {config.openaiApiKey}",
        "Content-Type": "application/json"
    }
    resp = requests.post(OPENAI_RESPONSES_URL, headers=headers, json=body, timeout=45)
    if not resp.ok:
        return {"ok": False, "error": resp.text}
    payload = resp.json()
    return {"ok": True, "text": _extract_text_from_response(payload), "raw": payload}


def _azure_responses(config: AnalyzeConfig, input_payload: List[Dict[str, Any]], instructions: Optional[str] = None):
    if not config.azureApiKey or not config.azureEndpoint or not config.azureDeployment:
        return {"ok": False, "error": "Azure OpenAI config is incomplete."}

    base = config.azureEndpoint.rstrip("/")
    path_url = f"{base}/openai/v1/responses"
    url = f"{path_url}?api-version={config.azureApiVersion}" if config.azureApiVersion else path_url

    body = {
        "model": config.azureDeployment,
        "input": input_payload,
        "instructions": instructions or config.instructions or "",
        "stream": False
    }
    headers = {
        "api-key": config.azureApiKey,
        "Content-Type": "application/json"
    }
    resp = requests.post(url, headers=headers, json=body, timeout=45)
    if not resp.ok:
        return {"ok": False, "error": resp.text}
    payload = resp.json()
    return {"ok": True, "text": _extract_text_from_response(payload), "raw": payload}


def _analyze_with_provider(config: AnalyzeConfig, input_payload: List[Dict[str, Any]], instructions: Optional[str] = None):
    provider = (config.provider or "openai").lower()
    if provider == "azure":
        return _azure_responses(config, input_payload, instructions)
    if provider == "openai":
        return _openai_responses(config, input_payload, instructions)
    return {"ok": False, "error": "Provider does not support analysis yet."}


def _build_image_input(prompt: str, image_file_id: Optional[str], image_data_url: Optional[str]):
    content: List[Dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    if image_file_id:
        content.append({"type": "input_image", "file_id": image_file_id, "detail": "auto"})
    elif image_data_url:
        content.append({"type": "input_image", "image_url": image_data_url, "detail": "auto"})
    return [{"role": "user", "content": content}]


def _build_file_input(prompt: str, file_id: Optional[str], text_snippet: Optional[str]):
    content: List[Dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    if file_id:
        content.append({"type": "input_file", "file_id": file_id})
    if text_snippet:
        content.append({"type": "input_text", "text": text_snippet})
    return [{"role": "user", "content": content}]


def _extract_video_frames(local_path: str) -> List[str]:
    output_dir = os.path.join(os.path.dirname(local_path), "frames")
    os.makedirs(output_dir, exist_ok=True)
    filename = os.path.splitext(os.path.basename(local_path))[0]
    pattern = os.path.join(output_dir, f"{filename}-%02d.jpg")
    try:
        subprocess.run(
            ["ffmpeg", "-i", local_path, "-vf", "fps=1/3", "-frames:v", "3", pattern],
            capture_output=True,
            check=True
        )
    except Exception:
        return []

    files = sorted(os.listdir(output_dir))
    frames = []
    for item in files:
        if item.startswith(filename):
            frames.append(os.path.join(output_dir, item))
    return frames[:3]


def _transcribe_openai(config: AnalyzeConfig, local_path: str, filename: str, mime_type: str):
    if not config.openaiApiKey:
        return {"ok": False, "error": "OpenAI API key is missing."}
    with open(local_path, "rb") as f:
        files = {
            "file": (filename, f, mime_type or "application/octet-stream")
        }
        data = {
            "model": config.openaiTranscribeModel or "gpt-4o-mini-transcribe"
        }
        headers = {"Authorization": f"Bearer {config.openaiApiKey}"}
        resp = requests.post(OPENAI_TRANSCRIPTIONS_URL, headers=headers, data=data, files=files, timeout=120)
    if not resp.ok:
        return {"ok": False, "error": resp.text}
    payload = resp.json()
    return {"ok": True, "text": payload.get("text", ""), "raw": payload}


def _resolve_record(req: AnalyzeRequest) -> AnalyzeRecord:
    if req.record is not None:
        return req.record
    return AnalyzeRecord(
        name=req.name,
        type=req.mime,
        size=req.size,
        localPath=req.path
    )


def _resolve_config(req: AnalyzeRequest) -> AnalyzeConfig:
    if req.config is not None:
        return req.config
    return AnalyzeConfig(provider="openai")


def _safe_text_snippet(local_path: str, limit: int = 8000) -> Optional[str]:
    if not local_path or not os.path.exists(local_path):
        return None
    try:
        with open(local_path, "rb") as f:
            data = f.read(limit)
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return None


def _analyze_record(record: AnalyzeRecord, config: AnalyzeConfig):
    mime = record.type or mimetypes.guess_type(record.name or "")[0] or ""

    if mime.startswith("image/"):
        image_data_url = None
        if not record.providerFileId and record.localPath and os.path.exists(record.localPath):
            with open(record.localPath, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("ascii")
            image_data_url = f"data:{mime};base64,{encoded}"
        input_payload = _build_image_input(
            "Analyze this image. Provide concise description, key objects, text, and scene summary.",
            record.providerFileId,
            image_data_url
        )
        return _analyze_with_provider(config, input_payload)

    if mime.startswith("audio/"):
        if (config.provider or "openai").lower() != "openai":
            return {"ok": False, "error": "Audio transcription is only wired for OpenAI currently."}
        if not record.localPath or not os.path.exists(record.localPath):
            return {"ok": False, "error": "Audio file missing on disk."}
        return _transcribe_openai(config, record.localPath, record.name or "audio", mime)

    if mime.startswith("video/"):
        if not record.localPath or not os.path.exists(record.localPath):
            return {"ok": False, "error": "Video file missing on disk."}
        frames = _extract_video_frames(record.localPath)
        if not frames:
            return {"ok": False, "error": "Video extraction failed."}
        images = []
        for frame in frames:
            with open(frame, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("ascii")
            images.append(f"data:image/jpeg;base64,{encoded}")
        content = [{"type": "input_text", "text": "Analyze these video frames. Summarize scene, actions, and objects."}]
        content.extend([{"type": "input_image", "image_url": img, "detail": "auto"} for img in images])
        input_payload = [{"role": "user", "content": content}]
        return _analyze_with_provider(config, input_payload)

    snippet = None
    if not record.providerFileId:
        snippet = _safe_text_snippet(record.localPath or "")
    input_payload = _build_file_input(
        "Analyze this file. Provide concise summary, key entities, and actionable insights.",
        record.providerFileId,
        snippet
    )
    return _analyze_with_provider(config, input_payload)


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
    return {"status": "ok", "route": route, "policy": policy}


@app.post("/analyze")
async def analyze(req: Optional[AnalyzeRequest] = None, path: Optional[str] = None, name: Optional[str] = None, mime: Optional[str] = None, size: Optional[int] = None):
    request_data = req or AnalyzeRequest(path=path, name=name, mime=mime, size=size)
    record = _resolve_record(request_data)
    config = _resolve_config(request_data)

    if not record.localPath and not record.providerFileId:
        metadata = {
            "name": record.name,
            "mime": record.type,
            "size": record.size,
            "exists": False,
            "sha256": None
        }
        return {"status": "ok", "metadata": metadata}

    result = _analyze_record(record, config)
    return {"status": "ok", "analysis": result}


@app.post("/jobs")
async def create_job(kind: str, path: Optional[str] = None):
    job_id = f"job_{uuid4()}"
    JOBS[job_id] = {"id": job_id, "kind": kind, "path": path, "status": "queued"}
    return {"status": "queued", "job": JOBS[job_id]}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        return {"status": "missing"}
    return {"status": "ok", "job": job}


@app.post("/transcribe")
async def transcribe(file: UploadFile):
    return {"status": "queued", "filename": file.filename, "message": "Audio transcription placeholder"}


@app.post("/vision")
async def vision(file: UploadFile):
    return {"status": "queued", "filename": file.filename, "message": "Image analysis placeholder"}


@app.post("/video")
async def video(file: UploadFile):
    return {"status": "queued", "filename": file.filename, "message": "Video analysis placeholder"}
