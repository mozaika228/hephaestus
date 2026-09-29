import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db.js";

const db = getDb();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createUser({ id, email, passwordHash, createdAt }) {
  db.prepare("INSERT INTO users (id, email, passwordHash, createdAt, updatedAt) VALUES (@id, @email, @passwordHash, @createdAt, @createdAt)")
    .run({ id, email, passwordHash, createdAt });
  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email) || null;
}

export function getUserById(id) {
  return db.prepare("SELECT id, email, createdAt FROM users WHERE id = ?").get(id) || null;
}

export function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const session = {
    id: randomBytes(16).toString("hex"),
    userId,
    tokenHash: hashToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  };
  db.prepare("INSERT INTO auth_sessions (id, userId, tokenHash, expiresAt, createdAt) VALUES (@id, @userId, @tokenHash, @expiresAt, @createdAt)").run(session);
  return { token, expiresAt: session.expiresAt };
}

export function getUserForToken(token) {
  if (!token || token.length > 256) return null;
  return db.prepare(`
    SELECT users.id, users.email, users.createdAt
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.userId
    WHERE auth_sessions.tokenHash = ? AND auth_sessions.expiresAt > ?
  `).get(hashToken(token), new Date().toISOString()) || null;
}

export function revokeSession(token) {
  if (!token) return false;
  return db.prepare("DELETE FROM auth_sessions WHERE tokenHash = ?").run(hashToken(token)).changes > 0;
}
