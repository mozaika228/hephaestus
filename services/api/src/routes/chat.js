import { getProvider } from "../providers/index.js";
import { getConfig } from "../config.js";
import { formatStreamError, formatStreamDone } from "../providers/stream.js";
import { errorJson } from "../http.js";
import { resolveChatDecision } from "../logic/aiLogicClient.js";
import { log } from "../logger.js";
import { createId } from "../store/ids.js";
import {
  createConversation,
  createMessage,
  getConversation,
  listMessages,
  updateConversation,
  updateMessage
} from "../store/conversations.js";

const validProviders = new Set(["openai", "ollama"]);

function validateChatBody(body) {
  const payload = body || {};
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const provider = typeof payload.provider === "string" ? payload.provider.trim().toLowerCase() : "";
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const fileId = typeof payload.fileId === "string" ? payload.fileId.trim() : "";
  const attachmentId = typeof payload.attachmentId === "string" ? payload.attachmentId.trim() : "";

  if (!message) return { ok: false, code: "invalid_request", message: "message is required." };
  if (provider && !validProviders.has(provider)) {
    return { ok: false, code: "invalid_request", message: "provider is invalid." };
  }
  return {
    ok: true,
    value: { message, provider: provider || undefined, conversationId: conversationId || undefined, fileId: fileId || undefined, attachmentId: attachmentId || undefined }
  };
}

function ensureConversation({ conversationId, message, provider }) {
  if (conversationId) {
    const existing = getConversation(conversationId);
    if (!existing) return null;
    return updateConversation(conversationId, {
      provider: provider || existing.provider,
      title: existing.title === "New conversation" ? message.slice(0, 80) : existing.title
    });
  }

  const now = new Date().toISOString();
  return createConversation({
    id: createId("conv"),
    title: message.slice(0, 80) || "New conversation",
    provider: provider || "openai",
    createdAt: now,
    updatedAt: now
  });
}

function recordUserMessage(conversationId, message, provider, attachmentId) {
  const now = new Date().toISOString();
  return createMessage({
    id: createId("msg"),
    conversationId,
    role: "user",
    content: message,
    provider,
    status: "complete",
    attachmentId,
    createdAt: now,
    updatedAt: now
  });
}

function responseHistory(conversationId) {
  return listMessages(conversationId)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map(({ role, content }) => ({ role, content }));
}

export function registerChatRoutes(app) {
  app.post("/chat", async (req, res) => {
    const parsed = validateChatBody(req.body);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    if (!parsed.ok) {
      res.write(formatStreamError(`${parsed.code}: ${parsed.message}`));
      res.end(formatStreamDone());
      return;
    }

    const { message, provider, conversationId, fileId, attachmentId } = parsed.value;
    const baseConfig = getConfig();
    const decision = await resolveChatDecision({ config: baseConfig, message, fileId, requestedProvider: provider });
    const { route, policy } = decision;

    if (policy.availableProviders.length === 0) {
      res.write(formatStreamError("invalid_configuration: No provider is configured.", "invalid_configuration"));
      res.end(formatStreamDone());
      return;
    }

    const conversation = ensureConversation({ conversationId, message, provider: policy.provider });
    if (!conversation) {
      res.write(formatStreamError("not_found: Conversation not found.", "not_found"));
      res.end(formatStreamDone());
      return;
    }

    const userMessage = recordUserMessage(conversation.id, message, policy.provider, attachmentId);
    const assistantId = createId("msg");
    const now = new Date().toISOString();
    createMessage({
      id: assistantId,
      conversationId: conversation.id,
      role: "assistant",
      content: "",
      provider: policy.provider,
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    const doneMetadata = { conversationId: conversation.id, messageId: assistantId };
    res.write(`data: ${JSON.stringify({ type: "conversation", conversationId: conversation.id, messageId: userMessage.id })}\n\n`);
    const history = responseHistory(conversation.id).filter((item) => !(item.role === "assistant" && item.content === ""));
    const config = { ...baseConfig, provider: policy.provider };
    const providerFn = getProvider(config);

    log("info", "chat_logic_decision", {
      requestId: req.requestId,
      conversationId: conversation.id,
      routeIntent: route.intent,
      routeReason: route.reason,
      selectedProvider: policy.provider,
      policyReason: policy.reason,
      logicSource: decision.source,
      fallbackProviders: policy.fallbackProviders
    });

    try {
      await providerFn({
        message,
        history,
        res,
        config,
        stream: true,
        fileId,
        doneMetadata,
        onComplete: (text, ok, error) => updateMessage(assistantId, {
          content: text || (error ? `[Provider error] ${error}` : ""),
          status: ok ? "complete" : "failed",
          provider: policy.provider
        })
      });
    } catch (error) {
      updateMessage(assistantId, {
        content: error?.message || "Chat stream failed.",
        status: "failed"
      });
      if (!res.writableEnded) {
        res.write(formatStreamError("internal_error: Chat stream error."));
        res.end(formatStreamDone(doneMetadata));
      }
    }
  });

  app.post("/chat/single", async (req, res) => {
    const parsed = validateChatBody(req.body);
    if (!parsed.ok) {
      res.status(400).json(errorJson(parsed.code, parsed.message));
      return;
    }

    const { message, provider, conversationId, fileId, attachmentId } = parsed.value;
    const baseConfig = getConfig();
    const decision = await resolveChatDecision({ config: baseConfig, message, fileId, requestedProvider: provider });
    const { route, policy } = decision;
    if (policy.availableProviders.length === 0) {
      res.status(503).json(errorJson("invalid_configuration", "No provider is configured."));
      return;
    }

    const conversation = ensureConversation({ conversationId, message, provider: policy.provider });
    if (!conversation) {
      res.status(404).json(errorJson("not_found", "Conversation not found."));
      return;
    }

    const userMessage = recordUserMessage(conversation.id, message, policy.provider, attachmentId);
    const history = responseHistory(conversation.id);
    log("info", "chat_logic_decision", {
      requestId: req.requestId,
      conversationId: conversation.id,
      routeIntent: route.intent,
      routeReason: route.reason,
      selectedProvider: policy.provider,
      policyReason: policy.reason,
      logicSource: decision.source,
      fallbackProviders: policy.fallbackProviders
    });

    for (const candidate of [policy.provider, ...policy.fallbackProviders]) {
      const config = { ...baseConfig, provider: candidate };
      try {
        const result = await getProvider(config)({ message, history, res, config, stream: false, fileId });
        if (result?.ok) {
          const now = new Date().toISOString();
          const assistant = createMessage({
            id: createId("msg"),
            conversationId: conversation.id,
            role: "assistant",
            content: result.text || "",
            provider: candidate,
            status: "complete",
            createdAt: now,
            updatedAt: now
          });
          res.json({ ok: true, text: result.text || "", provider: candidate, conversationId: conversation.id, messageId: assistant.id, userMessageId: userMessage.id });
          return;
        }
        const retryable = result.code === "provider_rate_limit" || result.code === "provider_unavailable";
        if (!retryable) {
          res.status(400).json(errorJson(result.code || "provider_error", result.error || "Provider request failed.", { provider: candidate }));
          return;
        }
      } catch (error) {
        log("error", "chat_single_provider_exception", { requestId: req.requestId, provider: candidate, message: error?.message || "" });
      }
    }
    res.status(503).json(errorJson("provider_unavailable", "All providers failed for this request."));
  });
}
