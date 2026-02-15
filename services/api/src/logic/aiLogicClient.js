import { routeIntent, routeFileIntent } from "./router.js";
import { resolveProviderPolicy } from "./policy.js";

const LOGIC_TIMEOUT_MS = 1800;

function providerFlags(config) {
  return {
    openaiConfigured: Boolean(config.openaiApiKey),
    azureConfigured: Boolean(config.azureApiKey && config.azureEndpoint && config.azureDeployment),
    localConfigured: Boolean(config.localEndpoint),
    customConfigured: Boolean(config.customEndpoint)
  };
}

function localChatDecision({ config, message, fileId, requestedProvider }) {
  const route = routeIntent({ message, fileId });
  const policy = resolveProviderPolicy({
    config,
    intent: route.intent,
    requestedProvider
  });
  return { route, policy, source: "node_fallback" };
}

function localFileDecision({ config, mime, requestedProvider }) {
  const route = routeFileIntent({ mime });
  const policy = resolveProviderPolicy({
    config,
    intent: route.intent,
    requestedProvider
  });
  return { route, policy, source: "node_fallback" };
}

async function requestDecision({ config, payload }) {
  if (!config.aiServiceUrl) return null;
  const url = `${config.aiServiceUrl.replace(/\/$/, "")}/logic/decision`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGIC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const parsed = await response.json();
    if (!parsed?.route || !parsed?.policy) return null;
    return { route: parsed.route, policy: parsed.policy, source: "python" };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveChatDecision({ config, message, fileId, requestedProvider }) {
  const remote = await requestDecision({
    config,
    payload: {
      mode: "chat",
      message,
      fileId,
      requestedProvider,
      configuredProvider: config.provider,
      providers: providerFlags(config)
    }
  });
  if (remote) return remote;
  return localChatDecision({ config, message, fileId, requestedProvider });
}

export async function resolveFileDecision({ config, mime, requestedProvider }) {
  const remote = await requestDecision({
    config,
    payload: {
      mode: "file",
      mime,
      requestedProvider,
      configuredProvider: config.provider,
      providers: providerFlags(config)
    }
  });
  if (remote) return remote;
  return localFileDecision({ config, mime, requestedProvider });
}
