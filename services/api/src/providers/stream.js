export function formatStreamChunk(text) {
  return `data: ${JSON.stringify({ type: "delta", text })}\n\n`;
}

export function formatStreamError(message, code = "provider_error") {
  return `data: ${JSON.stringify({ type: "error", code, message })}\n\n`;
}

export function formatStreamDone(metadata = {}) {
  return `data: ${JSON.stringify({ type: "done", ...metadata })}\n\n`;
}

export async function pipeSse({ upstreamResponse, onEvent, onError }) {
  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let delimiterIndex;
    while ((delimiterIndex = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);
      for (const line of rawEvent.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          await onEvent(JSON.parse(data));
        } catch (error) {
          if (onError) onError(error, data);
        }
      }
    }
  }
}
