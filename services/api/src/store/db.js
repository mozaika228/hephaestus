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
    title TEXT,
    dueAt TEXT,
    priority TEXT,
    status TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    kind TEXT,
    status TEXT,
    payload TEXT,
    result TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
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

db.prepare("UPDATE messages SET status = 'failed', content = CASE WHEN content = '' THEN '[Response interrupted by server restart]' ELSE content END, updatedAt = ? WHERE status = 'pending'")
  .run(new Date().toISOString());
