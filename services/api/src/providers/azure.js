import { formatStreamChunk, formatStreamDone, formatStreamError, pipeSse } from "./stream.js";
import { normalizeProviderError } from "../http.js";

function buildAzureUrl(config) {
  const base = config.azureEndpoint.replace(/\/$/, "");
  const path = `${base}/openai/v1/responses`;
  if (!config.azureApiVersion) return path;
  return `${path}?api-version=${config.azureApiVersion}`;
}

function buildAzureInput(message, fileId) {
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

export async function azureProvider({ message, res, config, stream = true, fileId }) {
  if (!config.azureApiKey || !config.azureEndpoint || !config.azureDeployment) {
    if (stream) {
      res.write(formatStreamError("Azure OpenAI config is missing.", "invalid_configuration"));
      res.end(formatStreamDone());
      return;
    }
    return { ok: false, code: "invalid_configuration", error: "Azure OpenAI config is missing." };
  }

  const body = {
    model: config.azureDeployment,
    input: buildAzureInput(message, fileId),
    stream
  };

  const response = await fetch(buildAzureUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.azureApiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    const code = normalizeProviderError(response.status);
    if (stream) {
      res.write(formatStreamError(`Azure OpenAI error: ${text}`, code));
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
      if (event.type === "response.output_text.delta") {
        res.write(formatStreamChunk(event.delta));
      }
      if (event.type === "response.completed") {
        res.end(formatStreamDone());
      }
      if (event.type === "response.failed") {
        res.write(formatStreamError("Azure response failed.", "provider_error"));
        res.end(formatStreamDone());
      }
    },
    onError: () => {
      res.write(formatStreamError("Azure stream parse error.", "provider_stream_error"));
      res.end(formatStreamDone());
    }
  });
}
