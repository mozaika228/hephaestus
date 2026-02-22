import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("SQLite database is created on configured persistent path", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hephaestus-db-"));
  const dbPath = path.join(tempDir, "hephaestus.db");

  const script = [
    "process.env.SQLITE_DB_PATH = process.argv[1];",
    "const { getDb } = await import('./src/store/db.js');",
    "const db = getDb();",
    "db.prepare('SELECT 1').get();"
  ].join("");

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, dbPath], {
    cwd: process.cwd(),
    encoding: "utf-8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(dbPath), true);
});
