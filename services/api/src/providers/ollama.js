import { formatStreamChunk, formatStreamDone, formatStreamError } from "./stream.js";

function ollamaChatUrl(endpoint) {
  const base = endpoint.replace(/\/$/, "");
  return base.endsWith("/api/chat") ? base : `${base}/api/chat`;
}

function buildMessages({ history, message, instructions }) {
  const messages = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  if (Array.isArray(history) && history.length) {
    messages.push(...history.map(({ role, content }) => ({ role, content: content || "" })));
  } else {
    messages.push({ role: "user", content: message || "" });
  }
  return messages;
}

export async function ollamaProvider({
  message, history, res, config, stream = true, doneMetadata = {}, onComplete
}) {
  if (!config.ollamaEndpoint) {
    const error = "Ollama endpoint is missing.";
    if (stream) {
      res.write(formatStreamError(error, "invalid_configuration"));
      await onComplete?.("", false, error);
      res.end(formatStreamDone(doneMetadata));
      return;
    }
    return { ok: false, code: "invalid_configuration", error };
  }

  const response = await fetch(ollamaChatUrl(config.ollamaEndpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel || "llama3.2",
      messages: buildMessages({ history, message, instructions: config.instructions }),
      stream
    })
  });

  if (!response.ok) {
    const error = await response.text();
    if (stream) {
      res.write(formatStreamError(`Ollama error: ${error}`, "provider_error"));
      await onComplete?.("", false, error);
      res.end(formatStreamDone(doneMetadata));
      return;
    }
    return { ok: false, code: "provider_error", error };
  }

  if (!stream) {
    const payload = await response.json().catch(() => ({}));
    const text = payload.message?.content || payload.response || "";
    return { ok: true, text, raw: payload };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const error = "Ollama returned an empty stream.";
    res.write(formatStreamError(error, "provider_stream_error"));
    await onComplete?.("", false, error);
    res.end(formatStreamDone(doneMetadata));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let failed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const payload = JSON.parse(line);
        if (payload.error) throw new Error(payload.error);
        const delta = payload.message?.content || "";
        if (delta) {
          answer += delta;
          res.write(formatStreamChunk(delta));
        }
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const payload = JSON.parse(buffer);
      if (payload.error) throw new Error(payload.error);
      const delta = payload.message?.content || "";
      if (delta) {
        answer += delta;
        res.write(formatStreamChunk(delta));
      }
    }
  } catch (error) {
    failed = true;
    res.write(formatStreamError(`Ollama stream failed: ${error.message}`, "provider_stream_error"));
    await onComplete?.(answer, false, error.message);
  }
  if (!failed) await onComplete?.(answer, true);
  res.end(formatStreamDone(doneMetadata));
}
