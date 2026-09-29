import { getDb } from "./db.js";

const db = getDb();

export function createConversation({ id, ownerId, title, provider, createdAt, updatedAt }) {
  db.prepare("INSERT INTO conversations (id, ownerId, title, provider, createdAt, updatedAt) VALUES (@id, @ownerId, @title, @provider, @createdAt, @updatedAt)")
    .run({ id, ownerId, title, provider, createdAt, updatedAt });
  return getConversation(id, ownerId);
}

export function listConversations(ownerId) {
  return db.prepare("SELECT c.*, COUNT(m.id) AS messageCount FROM conversations c LEFT JOIN messages m ON m.conversationId = c.id WHERE c.ownerId = ? GROUP BY c.id ORDER BY c.updatedAt DESC").all(ownerId);
}

export function getConversation(id, ownerId) {
  return db.prepare("SELECT * FROM conversations WHERE id = ? AND ownerId = ?").get(id, ownerId) || null;
}

export function updateConversation(id, ownerId, patch) {
  const current = getConversation(id, ownerId);
  if (!current) return null;
  const next = {
    ...current,
    title: patch.title ?? current.title,
    provider: patch.provider ?? current.provider,
    updatedAt: new Date().toISOString()
  };
  db.prepare("UPDATE conversations SET title=@title, provider=@provider, updatedAt=@updatedAt WHERE id=@id AND ownerId=@ownerId")
    .run({ ...next, id, ownerId });
  return getConversation(id, ownerId);
}

export function deleteConversation(id, ownerId) {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE conversationId = ? AND EXISTS (SELECT 1 FROM conversations WHERE id = ? AND ownerId = ?)").run(id, id, ownerId);
    db.prepare("DELETE FROM uploads WHERE conversationId = ? AND ownerId = ?").run(id, ownerId);
    return db.prepare("DELETE FROM conversations WHERE id = ? AND ownerId = ?").run(id, ownerId).changes > 0;
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

export function updateMessage(id, ownerId, patch) {
  const current = db.prepare("SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversationId WHERE m.id = ? AND c.ownerId = ?").get(id, ownerId);
  if (!current) return null;
  const next = {
    ...current,
    content: patch.content ?? current.content,
    provider: patch.provider ?? current.provider,
    status: patch.status ?? current.status,
    updatedAt: new Date().toISOString()
  };
  db.prepare("UPDATE messages SET content=@content, provider=@provider, status=@status, updatedAt=@updatedAt WHERE id=@id AND EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversationId AND conversations.ownerId = @ownerId)")
    .run({ ...next, id, ownerId });
  db.prepare("UPDATE conversations SET updatedAt = ? WHERE id = ?").run(next.updatedAt, current.conversationId);
  return getMessage(id);
}

export function getMessage(id) {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) || null;
}

export function listMessages(conversationId, ownerId) {
  return db.prepare("SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversationId WHERE m.conversationId = ? AND c.ownerId = ? ORDER BY m.createdAt ASC, m.rowid ASC").all(conversationId, ownerId);
}

export function listConversationFiles(conversationId, ownerId) {
  return db.prepare("SELECT id, name, type, size, status, providerFileId, analysis, createdAt, updatedAt FROM uploads WHERE conversationId = ? AND ownerId = ? ORDER BY createdAt ASC").all(conversationId, ownerId);
}

export function listConversationFilePaths(conversationId, ownerId) {
  return db.prepare("SELECT localPath FROM uploads WHERE conversationId = ? AND ownerId = ? AND localPath IS NOT NULL").all(conversationId, ownerId);
}
