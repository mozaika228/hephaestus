import { openaiProvider } from "./openai.js";
import { azureProvider } from "./azure.js";
import { localProvider } from "./local.js";
import { customProvider } from "./custom.js";

export function getProvider(config) {
  switch ((config.provider || "openai").toLowerCase()) {
    case "azure":
      return azureProvider;
    case "local":
      return localProvider;
    case "custom":
      return customProvider;
    case "openai":
    default:
      return openaiProvider;
  }
}
