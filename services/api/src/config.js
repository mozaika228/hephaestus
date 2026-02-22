export function getConfig() {
  const isRender = Boolean(process.env.RENDER);
  const defaultDbPath = isRender ? "/var/data/hephaestus.db" : "";

  return {
    provider: process.env.HEPHAESTUS_PROVIDER || "openai",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    openaiAnalysisModel: process.env.OPENAI_ANALYSIS_MODEL || "",
    openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    instructions: process.env.OPENAI_INSTRUCTIONS || "",
    azureApiKey: process.env.AZURE_OPENAI_API_KEY || "",
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || "",
    azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || "",
    localEndpoint: process.env.LOCAL_MODEL_ENDPOINT || "",
    customEndpoint: process.env.CUSTOM_PROVIDER_ENDPOINT || "",
    customAuthHeader: process.env.CUSTOM_PROVIDER_AUTH_HEADER || "",
    customAuthValue: process.env.CUSTOM_PROVIDER_AUTH_VALUE || "",
    aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
    orchestratorUrl: process.env.ORCHESTRATOR_URL || "http://localhost:8100",
    dbPath: process.env.SQLITE_DB_PATH || defaultDbPath,
    enableSso: (process.env.ENTERPRISE_SSO_ENABLED || "false").toLowerCase() === "true",
    ssoJwtSecret: process.env.SSO_JWT_SECRET || "",
    samlEntryPoint: process.env.SAML_ENTRY_POINT || "",
    samlIssuer: process.env.SAML_ISSUER || "hephaestus",
    samlAudience: process.env.SAML_AUDIENCE || "hephaestus-users",
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || "*",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120)
  };
}
