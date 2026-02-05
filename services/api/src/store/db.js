import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "storage");
const dbPath = path.join(dataDir, "hephaestus.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

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
`);

export function getDb() {
  return db;
}
