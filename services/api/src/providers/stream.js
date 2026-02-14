export function formatStreamChunk(text) {
  return `data: ${JSON.stringify({ type: "delta", text })}\n\n`;
}

export function formatStreamError(message, code = "provider_error") {
  return `data: ${JSON.stringify({ type: "error", code, message })}\n\n`;
}

export function formatStreamDone() {
  return "data: {\"type\":\"done\"}\n\n";
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

      const lines = rawEvent.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          await onEvent(parsed);
        } catch (error) {
          if (onError) onError(error, data);
        }
      }
    }
  }
}
