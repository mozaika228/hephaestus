import { createId } from "../store/ids.js";
import { createJob, getJob, listJobs, updateJob } from "../store/jobs.js";
import { getUpload, updateUpload } from "../store/uploads.js";
import { getConfig } from "../config.js";
import { analyzeFile } from "../providers/analysis.js";

export function registerJobRoutes(app) {
  app.get("/jobs", (req, res) => {
    res.json({ ok: true, jobs: listJobs() });
  });

  app.get("/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, job });
  });

  app.post("/jobs", (req, res) => {
    const { kind, uploadId } = req.body || {};
    const job = createJob({
      id: createId("job"),
      kind: kind || "analysis",
      status: "queued",
      payload: { uploadId },
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    queueJob(job);
    res.json({ ok: true, job });
  });
}

async function queueJob(job) {
  setTimeout(async () => {
    const current = getJob(job.id);
    if (!current) return;
    updateJob(job.id, { status: "running" });

    if (current.payload?.uploadId) {
      const record = getUpload(current.payload.uploadId);
      if (!record) {
        updateJob(job.id, { status: "failed", result: { error: "Upload not found" } });
        return;
      }

      const config = getConfig();
      const result = await analyzeFile({ record, config });
      updateUpload(record.id, {
        status: result.ok ? "analyzed" : "analysis_failed",
        analysis: result
      });
      updateJob(job.id, { status: result.ok ? "done" : "failed", result });
      return;
    }

    updateJob(job.id, { status: "done", result: { message: "No payload" } });
  }, 300);
}
