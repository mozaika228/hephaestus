import { createId } from "../store/ids.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversationFiles,
  listConversations,
  listMessages
} from "../store/conversations.js";
import { errorJson } from "../http.js";

export function registerConversationRoutes(app) {
  app.get("/conversations", (_req, res) => {
    res.json({ ok: true, conversations: listConversations() });
  });

  app.post("/conversations", (req, res) => {
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
    const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "openai";
    if (!["openai", "ollama"].includes(provider)) {
      res.status(400).json(errorJson("invalid_request", "provider must be openai or ollama."));
      return;
    }
    const now = new Date().toISOString();
    const conversation = createConversation({
      id: createId("conv"),
      title: title || "New conversation",
      provider,
      createdAt: now,
      updatedAt: now
    });
    res.status(201).json({ ok: true, conversation });
  });

  app.get("/conversations/:id", (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json(errorJson("not_found", "Conversation not found."));
      return;
    }
    res.json({
      ok: true,
      conversation,
      messages: listMessages(conversation.id),
      files: listConversationFiles(conversation.id)
    });
  });

  app.delete("/conversations/:id", (req, res) => {
    if (!getConversation(req.params.id)) {
      res.status(404).json(errorJson("not_found", "Conversation not found."));
      return;
    }
    deleteConversation(req.params.id);
    res.json({ ok: true, deleted: true });
  });
}
