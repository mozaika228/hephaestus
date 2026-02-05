import { formatStreamChunk, formatStreamDone, formatStreamError } from "./stream.js";

export async function localProvider({ message, res, config, stream = true, fileId }) {
  if (!config.localEndpoint) {
    if (stream) {
      res.write(formatStreamError("Local model endpoint is missing."));
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, error: "Local model endpoint is missing." };
  }

  const response = await fetch(config.localEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, stream: false, fileId })
  });

  if (!response.ok) {
    const text = await response.text();
    if (stream) {
      res.write(formatStreamError(`Local model error: ${text}`));
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, error: text };
  }

  const payload = await response.json().catch(() => ({}));
  const text = payload.text || payload.message || "";

  if (stream) {
    res.write(formatStreamChunk(text || "Local model replied."));
    res.end(formatStreamDone());
    return;
  }

  return { ok: true, text, raw: payload };
}
