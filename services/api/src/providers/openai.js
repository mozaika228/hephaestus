import { formatStreamChunk, formatStreamDone, formatStreamError, pipeSse } from "./stream.js";
import { log } from "../logger.js";
import { normalizeProviderError } from "../http.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

function buildOpenAIInput(history, message, fileId) {
  const messages = Array.isArray(history) && history.length
    ? history.map((item) => ({ role: item.role, content: item.content || "" }))
    : [{ role: "user", content: message || "" }];

  if (fileId) {
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    if (lastUser) {
      lastUser.content = [
        { type: "input_text", text: lastUser.content },
        { type: "input_file", file_id: fileId }
      ];
    }
  }
  return messages;
}

function extractTextFromResponse(payload) {
  const parts = [];
  for (const item of payload.output || []) {
    if (item.type !== "message") continue;
    for (const chunk of item.content || []) {
      if (chunk.type === "output_text") parts.push(chunk.text);
    }
  }
  return parts.join("").trim();
}

export async function openaiProvider({
  message, history, res, config, stream = true, fileId, doneMetadata = {}, onComplete
}) {
  if (!config.openaiApiKey) {
    const error = "OpenAI API key is missing.";
    if (stream) {
      res.write(formatStreamError(error, "provider_auth"));
      await onComplete?.("", false, error);
      res.end(formatStreamDone(doneMetadata));
      return;
    }
    return { ok: false, code: "provider_auth", error };
  }

  const body = {
    model: config.openaiModel || "gpt-4o-mini",
    input: buildOpenAIInput(history, message, fileId),
    stream
  };
  if (config.instructions) body.instructions = config.instructions;

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    const code = normalizeProviderError(response.status);
    if (stream) {
      res.write(formatStreamError(`OpenAI error: ${text}`, code));
      await onComplete?.("", false, text);
      log("error", "openai_response_not_ok", { statusCode: response.status, responseBody: text });
      res.end(formatStreamDone(doneMetadata));
      return;
    }
    return { ok: false, code, error: text };
  }

  if (!stream) {
    const payload = await response.json();
    return { ok: true, text: extractTextFromResponse(payload), raw: payload };
  }

  let answer = "";
  let finished = false;
  const finish = async (ok, error = "") => {
    if (finished) return;
    finished = true;
    await onComplete?.(answer, ok, error);
    res.end(formatStreamDone(doneMetadata));
  };

  await pipeSse({
    upstreamResponse: response,
    onEvent: async (event) => {
      if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
        const delta = event.delta || "";
        answer += delta;
        res.write(formatStreamChunk(delta));
      } else if (event.type === "response.completed") {
        await finish(true);
      } else if (event.type === "error" || event.type === "response.failed") {
        const detail = event.error?.message || event.response?.error?.message || event.message || event.error?.code || "unknown_error";
        res.write(formatStreamError(`OpenAI response failed: ${detail}`, "provider_error"));
        log("error", "openai_stream_error_event", { event });
        await finish(false, detail);
      }
    },
    onError: async () => {
      res.write(formatStreamError("OpenAI stream parse error.", "provider_stream_error"));
      await finish(false, "OpenAI stream parse error.");
    }
  });

  if (!finished) await finish(true);
}
