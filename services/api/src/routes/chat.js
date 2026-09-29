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
import { getUpload } from "../store/uploads.js";

const validProviders = new Set(["openai", "ollama"]);

function validateChatBody(body) {
  const payload = body || {};
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const provider = typeof payload.provider === "string" ? payload.provider.trim().toLowerCase() : "";
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const attachmentId = typeof payload.attachmentId === "string" ? payload.attachmentId.trim() : "";

  if (!message) return { ok: false, code: "invalid_request", message: "message is required." };
  if (message.length > 100000) return { ok: false, code: "invalid_request", message: "message must be 100,000 characters or fewer." };
  if (provider && !validProviders.has(provider)) {
    return { ok: false, code: "invalid_request", message: "provider is invalid." };
  }
  return {
    ok: true,
    value: { message, provider: provider || undefined, conversationId: conversationId || undefined, attachmentId: attachmentId || undefined }
  };
}

function ensureConversation({ conversationId, ownerId, message, provider }) {
  if (conversationId) {
    const existing = getConversation(conversationId, ownerId);
    if (!existing) return null;
    return updateConversation(conversationId, ownerId, {
      provider: provider || existing.provider,
      title: existing.title === "New conversation" ? message.slice(0, 80) : existing.title
    });
  }

  const now = new Date().toISOString();
  return createConversation({
    id: createId("conv"),
    ownerId,
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

function recordAssistantMessage(conversationId, content, provider, status = "complete") {
  const now = new Date().toISOString();
  return createMessage({
    id: createId("msg"), conversationId, role: "assistant", content,
    provider, status, createdAt: now, updatedAt: now
  });
}

function responseHistory(conversationId, ownerId) {
  return listMessages(conversationId, ownerId)
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

    const { message, provider, conversationId, attachmentId } = parsed.value;
    const attachment = attachmentId ? getUpload(attachmentId, req.user.id) : null;
    if (attachmentId && (!attachment || attachment.conversationId !== conversationId)) {
      res.write(formatStreamError("not_found: File attachment not found.", "not_found"));
      res.end(formatStreamDone());
      return;
    }
    const fileId = attachment?.providerFileId || undefined;
    const baseConfig = getConfig();
    const decision = await resolveChatDecision({ config: baseConfig, message, fileId, requestedProvider: provider });
    const { route, policy } = decision;

    if (policy.availableProviders.length === 0) {
      res.write(formatStreamError("invalid_configuration: No provider is configured.", "invalid_configuration"));
      res.end(formatStreamDone());
      return;
    }

    const conversation = ensureConversation({ conversationId, ownerId: req.user.id, message, provider: policy.provider });
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
    const history = responseHistory(conversation.id, req.user.id).filter((item) => !(item.role === "assistant" && item.content === ""));
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

    const controller = new AbortController();
    let disconnected = false;
    let timedOut = false;
    const onClose = () => {
      if (!res.writableEnded) {
        disconnected = true;
        controller.abort();
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, baseConfig.providerTimeoutMs);
    res.once("close", onClose);
    try {
      await providerFn({
        message,
        history,
        res,
        config,
        stream: true,
        fileId,
        signal: controller.signal,
        doneMetadata,
        onComplete: (text, ok, error) => updateMessage(assistantId, req.user.id, {
          content: text || (error ? `[${disconnected ? "Cancelled" : "Provider error"}] ${error}` : ""),
          status: ok ? "complete" : disconnected ? "cancelled" : "failed",
          provider: policy.provider
        })
      });
    } catch (error) {
      updateMessage(assistantId, req.user.id, {
        content: timedOut ? "[Provider timeout] The response took too long." : disconnected ? "[Cancelled] The client disconnected." : error?.message || "Chat stream failed.",
        status: disconnected ? "cancelled" : "failed"
      });
      if (!res.destroyed && !res.writableEnded) {
        const code = timedOut ? "provider_timeout" : disconnected ? "cancelled" : "internal_error";
        res.write(formatStreamError(timedOut ? "Provider request timed out." : disconnected ? "Request cancelled." : "Chat stream error.", code));
        res.end(formatStreamDone(doneMetadata));
      }
    } finally {
      clearTimeout(timeout);
      res.off("close", onClose);
    }
  });

  app.post("/chat/single", async (req, res) => {
    const parsed = validateChatBody(req.body);
    if (!parsed.ok) {
      res.status(400).json(errorJson(parsed.code, parsed.message));
      return;
    }

    const { message, provider, conversationId, attachmentId } = parsed.value;
    const attachment = attachmentId ? getUpload(attachmentId, req.user.id) : null;
    if (attachmentId && (!attachment || attachment.conversationId !== conversationId)) {
      res.status(404).json(errorJson("not_found", "File attachment not found."));
      return;
    }
    const fileId = attachment?.providerFileId || undefined;
    const baseConfig = getConfig();
    const decision = await resolveChatDecision({ config: baseConfig, message, fileId, requestedProvider: provider });
    const { route, policy } = decision;
    if (policy.availableProviders.length === 0) {
      res.status(503).json(errorJson("invalid_configuration", "No provider is configured."));
      return;
    }

    const conversation = ensureConversation({ conversationId, ownerId: req.user.id, message, provider: policy.provider });
    if (!conversation) {
      res.status(404).json(errorJson("not_found", "Conversation not found."));
      return;
    }

    const userMessage = recordUserMessage(conversation.id, message, policy.provider, attachmentId);
    const history = responseHistory(conversation.id, req.user.id);
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

    const controller = new AbortController();
    let disconnected = false;
    const onClose = () => { if (!res.writableEnded) { disconnected = true; controller.abort(); } };
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, baseConfig.providerTimeoutMs || 120000);
    res.once("close", onClose);
    try {
    for (const candidate of [policy.provider, ...policy.fallbackProviders]) {
      const config = { ...baseConfig, provider: candidate };
      try {
        const result = await getProvider(config)({ message, history, res, config, stream: false, fileId, signal: controller.signal });
        if (result?.ok) {
          const assistant = recordAssistantMessage(conversation.id, result.text || "", candidate);
          if (!disconnected) res.json({ ok: true, text: result.text || "", provider: candidate, conversationId: conversation.id, messageId: assistant.id, userMessageId: userMessage.id });
          return;
        }
        const retryable = result.code === "provider_rate_limit" || result.code === "provider_unavailable";
        if (!retryable) {
          const errorMessage = result.error || "Provider request failed.";
          recordAssistantMessage(conversation.id, `[Provider error] ${errorMessage}`, candidate, "failed");
          if (!disconnected) res.status(400).json(errorJson(result.code || "provider_error", errorMessage, { provider: candidate }));
          return;
        }
      } catch (error) {
        log("error", "chat_single_provider_exception", { requestId: req.requestId, provider: candidate, message: error?.message || "" });
      }
      if (controller.signal.aborted) break;
    }
    const failure = timedOut ? "[Provider timeout] The response took too long." : disconnected ? "[Cancelled] The client disconnected." : "[Provider error] All providers failed for this request.";
    recordAssistantMessage(conversation.id, failure, policy.provider, disconnected ? "cancelled" : "failed");
    if (!disconnected) {
      res.status(timedOut ? 504 : 503).json(errorJson(timedOut ? "provider_timeout" : "provider_unavailable", timedOut ? "Provider request timed out." : "All providers failed for this request."));
    }
    } finally {
      clearTimeout(timeout);
      res.off("close", onClose);
    }
  });
}
