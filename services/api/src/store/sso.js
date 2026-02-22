import { getDb } from "./db.js";

const db = getDb();

export function createSsoSession(session) {
  db.prepare(
    `INSERT INTO sso_sessions
      (id, provider, email, status, createdAt, updatedAt)
     VALUES
      (@id, @provider, @email, @status, @createdAt, @updatedAt)`
  ).run(session);
  return session;
}

export function updateSsoSession(id, patch) {
  const current = getSsoSession(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    `UPDATE sso_sessions
      SET provider=@provider, email=@email, status=@status, updatedAt=@updatedAt
      WHERE id=@id`
  ).run(next);
  return next;
}

export function getSsoSession(id) {
  return db.prepare("SELECT * FROM sso_sessions WHERE id = ?").get(id) || null;
}
