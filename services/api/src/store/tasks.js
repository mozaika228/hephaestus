import { getDb } from "./db.js";

const db = getDb();

export function listTasks(ownerId) {
  return db.prepare("SELECT * FROM tasks WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId);
}

export function createTask(task) {
  db.prepare(
    "INSERT INTO tasks (id, ownerId, title, dueAt, priority, status, createdAt, updatedAt) VALUES (@id, @ownerId, @title, @dueAt, @priority, @status, @createdAt, @updatedAt)"
  ).run(task);
  return task;
}

export function updateTask(id, ownerId, patch) {
  const current = getTask(id, ownerId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(
    "UPDATE tasks SET title=@title, dueAt=@dueAt, priority=@priority, status=@status, updatedAt=@updatedAt WHERE id=@id AND ownerId=@ownerId"
  ).run({ ...next, ownerId });
  return next;
}

export function getTask(id, ownerId) {
  return db.prepare("SELECT * FROM tasks WHERE id = ? AND ownerId = ?").get(id, ownerId) || null;
}
