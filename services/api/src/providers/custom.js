import { formatStreamChunk, formatStreamDone, formatStreamError } from "./stream.js";

export async function customProvider({ message, res, config, stream = true, fileId }) {
  if (!config.customEndpoint) {
    if (stream) {
      res.write(formatStreamError("Custom provider endpoint is missing.", "invalid_configuration"));
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, code: "invalid_configuration", error: "Custom provider endpoint is missing." };
  }

  const headers = { "Content-Type": "application/json" };
  if (config.customAuthHeader && config.customAuthValue) {
    headers[config.customAuthHeader] = config.customAuthValue;
  }

  const response = await fetch(config.customEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, stream: false, fileId })
  });

  if (!response.ok) {
    const text = await response.text();
    if (stream) {
      res.write(formatStreamError(`Custom provider error: ${text}`, "provider_error"));
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, code: "provider_error", error: text };
  }

  const payload = await response.json().catch(() => ({}));
  const text = payload.text || payload.message || "";

  if (stream) {
    res.write(formatStreamChunk(text || "Custom provider replied."));
    res.end(formatStreamDone());
    return;
  }

  return { ok: true, text, raw: payload };
}
