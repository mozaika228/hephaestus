import fs from "node:fs/promises";
import path from "node:path";
import { Blob } from "buffer";

import { createId } from "../store/ids.js";
import { addUpload, getUpload, updateUpload } from "../store/uploads.js";
import { getConfig } from "../config.js";
import { analyzeFile } from "../providers/analysis.js";

const storageDir = path.join(process.cwd(), "storage", "uploads");

async function ensureStorage() {
  await fs.mkdir(storageDir, { recursive: true });
}

async function uploadToOpenAI(file, config) {
  if (!config.openaiApiKey) return null;

  const form = new FormData();
  form.append("purpose", "user_data");
  form.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype }),
    file.originalname
  );

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: form
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload.id || null;
}

export function registerFileRoutes(app, upload) {
  app.post("/files/upload", (req, res) => {
    const { name, type, size } = req.body || {};
    const id = createId("file");
    const record = addUpload({
      id,
      name: name || "untitled",
      type: type || "application/octet-stream",
      size: size || 0,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({
      ok: true,
      file: record,
      message: "Upload registered. Binary ingestion is handled via /files/ingest."
    });
  });

  app.post("/files/ingest", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded" });
      return;
    }

    await ensureStorage();
    const id = createId("file");
    const storedPath = path.join(storageDir, `${id}-${file.originalname}`);
    await fs.writeFile(storedPath, file.buffer);

    const config = getConfig();
    const providerFileId = await uploadToOpenAI(file, config);

    const record = addUpload({
      id,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      status: "stored",
      providerFileId: providerFileId || null,
      localPath: storedPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({
      ok: true,
      file: record,
      message: providerFileId
        ? "Stored locally and uploaded to OpenAI files."
        : "Stored locally. OpenAI upload skipped."
    });
  });

  app.post("/files/:id/analyze", async (req, res) => {
    const record = getUpload(req.params.id);
    if (!record) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }

    const config = getConfig();
    const result = await analyzeFile({ record, config });

    const updated = updateUpload(record.id, {
      status: result.ok ? "analyzed" : "analysis_failed",
      analysis: result
    });

    res.json({ ok: true, file: updated, analysis: result });
  });

  app.get("/files/:id", (req, res) => {
    const record = getUpload(req.params.id);
    if (!record) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, file: record });
  });

  app.post("/files/:id/complete", (req, res) => {
    const record = updateUpload(req.params.id, { status: "processed" });
    if (!record) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, file: record });
  });
}
