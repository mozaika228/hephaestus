import { formatStreamChunk, formatStreamDone, formatStreamError, pipeSse } from "./stream.js";
import { log } from "../logger.js";
import { normalizeProviderError } from "../http.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

function buildOpenAIInput(message, fileId) {
  const input = [
    {
      role: "user",
      content: [
        { type: "input_text", text: message || "" }
      ]
    }
  ];

  if (fileId) {
    input[0].content.push({ type: "input_file", file_id: fileId });
  }

  return input;
}

function extractTextFromResponse(payload) {
  const output = payload.output || [];
  const parts = [];

  for (const item of output) {
    if (item.type !== "message") continue;
    const content = item.content || [];
    for (const chunk of content) {
      if (chunk.type === "output_text") {
        parts.push(chunk.text);
      }
    }
  }

  return parts.join("").trim();
}

export async function openaiProvider({ message, res, config, stream = true, fileId }) {
  if (!config.openaiApiKey) {
    if (stream) {
      res.write(formatStreamError("OpenAI API key is missing.", "provider_auth"));
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, code: "provider_auth", error: "OpenAI API key is missing." };
  }

  const body = {
    model: config.openaiModel || "gpt-4o-mini",
    input: buildOpenAIInput(message, fileId),
    stream
  };

  if (config.instructions) {
    body.instructions = config.instructions;
  }

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
      log("error", "openai_response_not_ok", {
        statusCode: response.status,
        responseBody: text
      });
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, code, error: text };
  }

  if (!stream) {
    const payload = await response.json();
    return { ok: true, text: extractTextFromResponse(payload), raw: payload };
  }

  await pipeSse({
    upstreamResponse: response,
    onEvent: async (event) => {
      if (event.type === "error") {
        const detail =
          event.error?.message ||
          event.message ||
          event.code ||
          "unknown_error";
        res.write(formatStreamError(`OpenAI stream error: ${detail}`, "provider_error"));
        log("error", "openai_stream_error_event", { event });
        res.end(formatStreamDone());
        return;
      }
      if (event.type === "response.output_text.delta") {
        res.write(formatStreamChunk(event.delta));
      }
      if (event.type === "response.completed") {
        res.end(formatStreamDone());
      }
      if (event.type === "response.refusal.delta") {
        res.write(formatStreamChunk(event.delta));
      }
      if (event.type === "response.failed") {
        const detail =
          event.error?.message ||
          event.response?.error?.message ||
          event.response?.error?.code ||
          event.error?.code ||
          "unknown_error";
        res.write(formatStreamError(`OpenAI response failed: ${detail}`, "provider_error"));
        log("error", "openai_response_failed_event", { event });
        res.end(formatStreamDone());
      }
    },
    onError: () => {
      res.write(formatStreamError("OpenAI stream parse error.", "provider_stream_error"));
      log("error", "openai_stream_parse_error");
      res.end(formatStreamDone());
    }
  });
}
