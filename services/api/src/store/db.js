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
