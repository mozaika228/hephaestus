import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const configuredDbPath = process.env.SQLITE_DB_PATH || "";
const fallbackDataDir = path.join(process.cwd(), "storage");
const dbPath = configuredDbPath || path.join(fallbackDataDir, "hephaestus.db");
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tokenHash TEXT NOT NULL UNIQUE,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(tokenHash);

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    size INTEGER,
    status TEXT,
    providerFileId TEXT,
    localPath TEXT,
    analysis TEXT,
    localMeta TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    ownerId TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    provider TEXT,
    status TEXT NOT NULL DEFAULT 'complete',
    attachmentId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversationId, createdAt);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    ownerId TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    dueAt TEXT,
    priority TEXT,
    status TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    ownerId TEXT REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT,
    status TEXT,
    payload TEXT,
    result TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    ownerId TEXT REFERENCES users(id) ON DELETE CASCADE,
    requestId TEXT,
    method TEXT,
    path TEXT,
    statusCode INTEGER,
    durationMs INTEGER,
    provider TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS sso_sessions (
    id TEXT PRIMARY KEY,
    provider TEXT,
    email TEXT,
    status TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );
`);

export function getDb() {
  return db;
}

// Lightweight migrations for databases created before conversation support.
const uploadColumns = db.prepare("PRAGMA table_info(uploads)").all().map((column) => column.name);
if (!uploadColumns.includes("conversationId")) {
  db.exec("ALTER TABLE uploads ADD COLUMN conversationId TEXT");
}
for (const [table, column, definition] of [
  ["conversations", "ownerId", "TEXT REFERENCES users(id) ON DELETE CASCADE"],
  ["uploads", "ownerId", "TEXT REFERENCES users(id) ON DELETE CASCADE"],
  ["tasks", "ownerId", "TEXT REFERENCES users(id) ON DELETE CASCADE"],
  ["jobs", "ownerId", "TEXT REFERENCES users(id) ON DELETE CASCADE"]
]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
const analyticsColumns = db.prepare("PRAGMA table_info(analytics_events)").all().map((item) => item.name);
if (!analyticsColumns.includes("ownerId")) db.exec("ALTER TABLE analytics_events ADD COLUMN ownerId TEXT REFERENCES users(id) ON DELETE CASCADE");
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated ON conversations(ownerId, updatedAt);
  CREATE INDEX IF NOT EXISTS idx_uploads_owner_conversation ON uploads(ownerId, conversationId);
  CREATE INDEX IF NOT EXISTS idx_tasks_owner_created ON tasks(ownerId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_jobs_owner_created ON jobs(ownerId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_analytics_owner_created ON analytics_events(ownerId, createdAt);
`);

db.prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?").run(new Date().toISOString());

db.prepare("UPDATE messages SET status = 'failed', content = CASE WHEN content = '' THEN '[Response interrupted by server restart]' ELSE content END, updatedAt = ? WHERE status = 'pending'")
  .run(new Date().toISOString());
