import { openaiProvider } from "./openai.js";
import { ollamaProvider } from "./ollama.js";

export function getProvider(config) {
  switch ((config.provider || "openai").toLowerCase()) {
    case "ollama":
      return ollamaProvider;
    case "openai":
    default:
      return openaiProvider;
  }
}
