from fastapi import FastAPI, UploadFile
from typing import Optional
from uuid import uuid4
import hashlib
import os

app = FastAPI(title="Hephaestus AI Service")

JOBS = {}


def hash_file(path: str) -> Optional[str]:
    try:
        sha = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha.update(chunk)
        return sha.hexdigest()
    except Exception:
        return None


@app.get("/health")
async def health():
    return {"status": "Hephaestus AI online"}


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
