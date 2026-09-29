import { getDb } from "./db.js";

const db = getDb();

export function addUpload(record) {
  db.prepare(
    "INSERT INTO uploads (id, ownerId, name, type, size, status, providerFileId, localPath, analysis, localMeta, conversationId, createdAt, updatedAt) VALUES (@id, @ownerId, @name, @type, @size, @status, @providerFileId, @localPath, @analysis, @localMeta, @conversationId, @createdAt, @updatedAt)"
  ).run({
    ...record,
    ownerId: record.ownerId,
    analysis: record.analysis ? JSON.stringify(record.analysis) : null,
    localMeta: record.localMeta ? JSON.stringify(record.localMeta) : null,
    conversationId: record.conversationId || null
  });
  return record;
}

export function getUpload(id, ownerId) {
  const record = db.prepare("SELECT * FROM uploads WHERE id = ? AND ownerId = ?").get(id, ownerId);
  if (!record) return null;
  return {
    ...record,
    analysis: record.analysis ? JSON.parse(record.analysis) : null,
    localMeta: record.localMeta ? JSON.parse(record.localMeta) : null
  };
}

export function updateUpload(id, ownerId, patch) {
  const current = getUpload(id, ownerId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    "UPDATE uploads SET name=@name, type=@type, size=@size, status=@status, providerFileId=@providerFileId, localPath=@localPath, analysis=@analysis, localMeta=@localMeta, conversationId=@conversationId, updatedAt=@updatedAt WHERE id=@id AND ownerId=@ownerId"
  ).run({
    ...next,
    analysis: next.analysis ? JSON.stringify(next.analysis) : null,
    localMeta: next.localMeta ? JSON.stringify(next.localMeta) : null,
    conversationId: next.conversationId || null
  });
  return next;
}

export function deleteUpload(id, ownerId) {
  return db.prepare("DELETE FROM uploads WHERE id = ? AND ownerId = ?").run(id, ownerId).changes > 0;
}
