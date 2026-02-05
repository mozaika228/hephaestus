import { getDb } from "./db.js";

const db = getDb();

export function createJob(job) {
  db.prepare(
    "INSERT INTO jobs (id, kind, status, payload, result, createdAt, updatedAt) VALUES (@id, @kind, @status, @payload, @result, @createdAt, @updatedAt)"
  ).run({
    ...job,
    payload: job.payload ? JSON.stringify(job.payload) : null,
    result: job.result ? JSON.stringify(job.result) : null
  });
  return job;
}

export function updateJob(id, patch) {
  const current = getJob(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    "UPDATE jobs SET status=@status, payload=@payload, result=@result, updatedAt=@updatedAt WHERE id=@id"
  ).run({
    ...next,
    payload: next.payload ? JSON.stringify(next.payload) : null,
    result: next.result ? JSON.stringify(next.result) : null
  });
  return next;
}

export function getJob(id) {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!job) return null;
  return {
    ...job,
    payload: job.payload ? JSON.parse(job.payload) : null,
    result: job.result ? JSON.parse(job.result) : null
  };
}

export function listJobs() {
  return db.prepare("SELECT * FROM jobs ORDER BY createdAt DESC").all().map((job) => ({
    ...job,
    payload: job.payload ? JSON.parse(job.payload) : null,
    result: job.result ? JSON.parse(job.result) : null
  }));
}
