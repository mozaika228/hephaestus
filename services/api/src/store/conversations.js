import { getDb } from "./db.js";

const db = getDb();

export function createConversation({ id, title, provider, createdAt, updatedAt }) {
  db.prepare("INSERT INTO conversations (id, title, provider, createdAt, updatedAt) VALUES (@id, @title, @provider, @createdAt, @updatedAt)")
    .run({ id, title, provider, createdAt, updatedAt });
  return getConversation(id);
}

export function listConversations() {
  return db.prepare("SELECT c.*, COUNT(m.id) AS messageCount FROM conversations c LEFT JOIN messages m ON m.conversationId = c.id GROUP BY c.id ORDER BY c.updatedAt DESC").all();
}

export function getConversation(id) {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) || null;
}

export function updateConversation(id, patch) {
  const current = getConversation(id);
  if (!current) return null;
  const next = {
    ...current,
    title: patch.title ?? current.title,
    provider: patch.provider ?? current.provider,
    updatedAt: new Date().toISOString()
  };
  db.prepare("UPDATE conversations SET title=@title, provider=@provider, updatedAt=@updatedAt WHERE id=@id")
    .run({ ...next, id });
  return getConversation(id);
}

export function deleteConversation(id) {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE conversationId = ?").run(id);
    db.prepare("DELETE FROM uploads WHERE conversationId = ?").run(id);
    return db.prepare("DELETE FROM conversations WHERE id = ?").run(id).changes > 0;
  });
  return transaction();
}

export function createMessage(message) {
  db.prepare("INSERT INTO messages (id, conversationId, role, content, provider, status, attachmentId, createdAt, updatedAt) VALUES (@id, @conversationId, @role, @content, @provider, @status, @attachmentId, @createdAt, @updatedAt)")
    .run({
      ...message,
      provider: message.provider || null,
      status: message.status || "complete",
      attachmentId: message.attachmentId || null
    });
  db.prepare("UPDATE conversations SET updatedAt = ? WHERE id = ?").run(message.updatedAt, message.conversationId);
  return getMessage(message.id);
}

export function updateMessage(id, patch) {
  const current = getMessage(id);
  if (!current) return null;
  const next = {
    ...current,
    content: patch.content ?? current.content,
    provider: patch.provider ?? current.provider,
    status: patch.status ?? current.status,
    updatedAt: new Date().toISOString()
  };
  db.prepare("UPDATE messages SET content=@content, provider=@provider, status=@status, updatedAt=@updatedAt WHERE id=@id")
    .run({ ...next, id });
  db.prepare("UPDATE conversations SET updatedAt = ? WHERE id = ?").run(next.updatedAt, current.conversationId);
  return getMessage(id);
}

export function getMessage(id) {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) || null;
}

export function listMessages(conversationId) {
  return db.prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC, rowid ASC").all(conversationId);
}

export function listConversationFiles(conversationId) {
  return db.prepare("SELECT id, name, type, size, status, providerFileId, analysis, createdAt, updatedAt FROM uploads WHERE conversationId = ? ORDER BY createdAt ASC").all(conversationId);
}
