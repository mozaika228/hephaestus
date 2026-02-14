export function validateConfig(config) {
  const issues = [];
  const provider = (config.provider || "openai").toLowerCase();

  if (!config.aiServiceUrl) {
    issues.push("AI_SERVICE_URL is required.");
  }

  if (provider === "openai" && !config.openaiApiKey) {
    issues.push("OPENAI_API_KEY is required when HEPHAESTUS_PROVIDER=openai.");
  }

  if (provider === "azure") {
    if (!config.azureApiKey) {
      issues.push("AZURE_OPENAI_API_KEY is required when HEPHAESTUS_PROVIDER=azure.");
    }
    if (!config.azureEndpoint) {
      issues.push("AZURE_OPENAI_ENDPOINT is required when HEPHAESTUS_PROVIDER=azure.");
    }
    if (!config.azureDeployment) {
      issues.push("AZURE_OPENAI_DEPLOYMENT is required when HEPHAESTUS_PROVIDER=azure.");
    }
  }

  if (provider === "local" && !config.localEndpoint) {
    issues.push("LOCAL_MODEL_ENDPOINT is required when HEPHAESTUS_PROVIDER=local.");
  }

  if (provider === "custom" && !config.customEndpoint) {
    issues.push("CUSTOM_PROVIDER_ENDPOINT is required when HEPHAESTUS_PROVIDER=custom.");
  }

  if (!Number.isFinite(config.rateLimitWindowMs) || config.rateLimitWindowMs <= 0) {
    issues.push("RATE_LIMIT_WINDOW_MS must be a positive number.");
  }

  if (!Number.isFinite(config.rateLimitMax) || config.rateLimitMax <= 0) {
    issues.push("RATE_LIMIT_MAX must be a positive number.");
  }

  return issues;
}
