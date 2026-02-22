export function validateConfig(config) {
  const issues = [];
  const provider = (config.provider || "openai").toLowerCase();

  if (!config.aiServiceUrl) {
    issues.push("AI_SERVICE_URL is required.");
  }

  if (!config.orchestratorUrl) {
    issues.push("ORCHESTRATOR_URL is required.");
  }

  if (provider === "openai" && !config.openaiApiKey) {
    issues.push("OPENAI_API_KEY is required when HEPHAESTUS_PROVIDER=openai.");
  }

  if (provider === "ollama" && !config.ollamaEndpoint) {
    issues.push("OLLAMA_BASE_URL is required when HEPHAESTUS_PROVIDER=ollama.");
  }

  if (provider !== "openai" && provider !== "ollama") {
    issues.push("HEPHAESTUS_PROVIDER must be either openai or ollama.");
  }

  if (!Number.isFinite(config.rateLimitWindowMs) || config.rateLimitWindowMs <= 0) {
    issues.push("RATE_LIMIT_WINDOW_MS must be a positive number.");
  }

  if (!Number.isFinite(config.rateLimitMax) || config.rateLimitMax <= 0) {
    issues.push("RATE_LIMIT_MAX must be a positive number.");
  }

  if (config.enableSso && !config.ssoJwtSecret) {
    issues.push("SSO_JWT_SECRET is required when ENTERPRISE_SSO_ENABLED=true.");
  }

  return issues;
}
