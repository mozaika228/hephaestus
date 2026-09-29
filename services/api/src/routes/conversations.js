import fs from "node:fs/promises";
import path from "node:path";
import { createId } from "../store/ids.js";
import { getConfig } from "../config.js";
import { deleteOpenAIFile } from "../providers/fileStorage.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversationFiles,
  listConversationFilePaths,
  listConversations,
  listMessages
} from "../store/conversations.js";
import { errorJson } from "../http.js";

export function registerConversationRoutes(app) {
  app.get("/conversations", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, conversations: listConversations(req.user.id) });
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
      ownerId: req.user.id,
      title: title || "New conversation",
      provider,
      createdAt: now,
      updatedAt: now
    });
    res.status(201).json({ ok: true, conversation });
  });

  app.get("/conversations/:id", (req, res) => {
    const conversation = getConversation(req.params.id, req.user.id);
    if (!conversation) {
      res.status(404).json(errorJson("not_found", "Conversation not found."));
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      conversation,
      messages: listMessages(conversation.id, req.user.id),
      files: listConversationFiles(conversation.id, req.user.id)
    });
  });

  app.delete("/conversations/:id", async (req, res) => {
    const conversation = getConversation(req.params.id, req.user.id);
    if (!conversation) {
      res.status(404).json(errorJson("not_found", "Conversation not found."));
      return;
    }
    const config = getConfig();
    const uploadsRoot = `${path.resolve(config.uploadsDir)}${path.sep}`;
    try {
      const files = listConversationFiles(conversation.id, req.user.id);
      for (const file of files) {
        if (file.providerFileId && !(await deleteOpenAIFile(file.providerFileId, config))) {
          res.status(502).json(errorJson("provider_file_delete_failed", "Could not delete a file from its AI provider. Retry deletion."));
          return;
        }
      }
      for (const { localPath } of listConversationFilePaths(conversation.id, req.user.id)) {
        const absolutePath = path.resolve(localPath);
        if (absolutePath.startsWith(uploadsRoot)) await fs.rm(absolutePath, { force: true });
      }
      deleteConversation(conversation.id, req.user.id);
    } catch {
      res.status(500).json(errorJson("storage_error", "Could not remove conversation files."));
      return;
    }
    res.json({ ok: true, deleted: true });
  });
}
