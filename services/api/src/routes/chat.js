import { getProvider } from "../providers/index.js";
import { getConfig } from "../config.js";
import { formatStreamError, formatStreamDone } from "../providers/stream.js";
import { errorJson } from "../http.js";
import { resolveChatDecision } from "../logic/aiLogicClient.js";
import { log } from "../logger.js";

const validProviders = new Set(["openai", "azure", "local", "custom"]);

function validateChatBody(body) {
  const payload = body || {};
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const provider = typeof payload.provider === "string" ? payload.provider.trim().toLowerCase() : "";
  const fileId = typeof payload.fileId === "string" ? payload.fileId.trim() : "";

  if (!message) {
    return { ok: false, code: "invalid_request", message: "message is required." };
  }

  if (provider && !validProviders.has(provider)) {
    return { ok: false, code: "invalid_request", message: "provider is invalid." };
  }

  return { ok: true, value: { message, provider: provider || undefined, fileId: fileId || undefined } };
}

export function registerChatRoutes(app) {
  app.post("/chat", async (req, res) => {
    const parsed = validateChatBody(req.body);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!parsed.ok) {
      res.write(formatStreamError(`${parsed.code}: ${parsed.message}`));
      res.end(formatStreamDone());
      return;
    }

    const { message, provider, fileId } = parsed.value;
    const baseConfig = getConfig();
    const decision = await resolveChatDecision({
      config: baseConfig,
      message,
      fileId,
      requestedProvider: provider
    });
    const route = decision.route;
    const policy = decision.policy;

    if (policy.availableProviders.length === 0) {
      res.write(formatStreamError("invalid_configuration: No provider is configured.", "invalid_configuration"));
      res.end(formatStreamDone());
      return;
    }

    const config = { ...baseConfig, provider: policy.provider };
    const providerFn = getProvider(config);
    log("info", "chat_logic_decision", {
      requestId: req.requestId,
      routeIntent: route.intent,
      routeReason: route.reason,
      selectedProvider: policy.provider,
      policyReason: policy.reason,
      logicSource: decision.source,
      fallbackProviders: policy.fallbackProviders
    });

    try {
      await providerFn({ message, res, config, stream: true, fileId });
    } catch (error) {
      res.write(formatStreamError("internal_error: Chat stream error."));
      res.end(formatStreamDone());
    }
  });

  app.post("/chat/single", async (req, res) => {
    const parsed = validateChatBody(req.body);
    if (!parsed.ok) {
      res.status(400).json(errorJson(parsed.code, parsed.message));
      return;
    }

    const { message, provider, fileId } = parsed.value;
    const baseConfig = getConfig();
    const decision = await resolveChatDecision({
      config: baseConfig,
      message,
      fileId,
      requestedProvider: provider
    });
    const route = decision.route;
    const policy = decision.policy;

    if (policy.availableProviders.length === 0) {
      res.status(503).json(errorJson("invalid_configuration", "No provider is configured."));
      return;
    }

    const tryOrder = [policy.provider, ...policy.fallbackProviders];
    log("info", "chat_logic_decision", {
      requestId: req.requestId,
      routeIntent: route.intent,
      routeReason: route.reason,
      selectedProvider: policy.provider,
      policyReason: policy.reason,
      logicSource: decision.source,
      fallbackProviders: policy.fallbackProviders
    });

    try {
      for (const candidate of tryOrder) {
        const config = { ...baseConfig, provider: candidate };
        const providerFn = getProvider(config);
        const result = await providerFn({ message, res, config, stream: false, fileId });

        if (result?.ok !== false) {
          res.json({ ok: true, text: result?.text || "", provider: candidate });
          return;
        }

        const retryable = result.code === "provider_rate_limit" || result.code === "provider_unavailable";
        if (!retryable) {
          res.status(400).json(
            errorJson(result.code || "provider_error", result.error || "Provider request failed.", {
              provider: candidate
            })
          );
          return;
        }
      }
      res.status(503).json(errorJson("provider_unavailable", "All providers failed for this request."));
    } catch (error) {
      res.status(500).json(errorJson("internal_error", "Chat request failed."));
    }
  });
}
