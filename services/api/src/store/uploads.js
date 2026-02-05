import { getDb } from "./db.js";

const db = getDb();

export function addUpload(record) {
  db.prepare(
    "INSERT INTO uploads (id, name, type, size, status, providerFileId, localPath, analysis, localMeta, createdAt, updatedAt) VALUES (@id, @name, @type, @size, @status, @providerFileId, @localPath, @analysis, @localMeta, @createdAt, @updatedAt)"
  ).run({
    ...record,
    analysis: record.analysis ? JSON.stringify(record.analysis) : null,
    localMeta: record.localMeta ? JSON.stringify(record.localMeta) : null
  });
  return record;
}

export function getUpload(id) {
  const record = db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
  if (!record) return null;
  return {
    ...record,
    analysis: record.analysis ? JSON.parse(record.analysis) : null,
    localMeta: record.localMeta ? JSON.parse(record.localMeta) : null
  };
}

export function updateUpload(id, patch) {
  const current = getUpload(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    "UPDATE uploads SET name=@name, type=@type, size=@size, status=@status, providerFileId=@providerFileId, localPath=@localPath, analysis=@analysis, localMeta=@localMeta, updatedAt=@updatedAt WHERE id=@id"
  ).run({
    ...next,
    analysis: next.analysis ? JSON.stringify(next.analysis) : null,
    localMeta: next.localMeta ? JSON.stringify(next.localMeta) : null
  });
  return next;
}
