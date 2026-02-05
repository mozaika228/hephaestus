import { getDb } from "./db.js";

const db = getDb();

export function listTasks() {
  return db.prepare("SELECT * FROM tasks ORDER BY createdAt DESC").all();
}

export function createTask(task) {
  db.prepare(
    "INSERT INTO tasks (id, title, dueAt, priority, status, createdAt, updatedAt) VALUES (@id, @title, @dueAt, @priority, @status, @createdAt, @updatedAt)"
  ).run(task);
  return task;
}

export function updateTask(id, patch) {
  const current = getTask(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    "UPDATE tasks SET title=@title, dueAt=@dueAt, priority=@priority, status=@status, updatedAt=@updatedAt WHERE id=@id"
  ).run(next);
  return next;
}

export function getTask(id) {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) || null;
}
