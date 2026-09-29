import path from "node:path";

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
    ollamaEndpoint: process.env.OLLAMA_BASE_URL || "",
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.2",
    aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
    orchestratorUrl: process.env.ORCHESTRATOR_URL || "http://localhost:8100",
    enterpriseJavaUrl: process.env.ENTERPRISE_JAVA_URL || "http://localhost:8200",
    runtimeCppUrl: process.env.RUNTIME_CPP_URL || "http://localhost:8300",
    dbPath: process.env.SQLITE_DB_PATH || defaultDbPath,
    uploadsDir: process.env.UPLOADS_DIR || path.join(
      path.dirname(process.env.SQLITE_DB_PATH || defaultDbPath || path.join(process.cwd(), "storage", "hephaestus.db")),
      "uploads"
    ),
    enableSso: (process.env.ENTERPRISE_SSO_ENABLED || "false").toLowerCase() === "true",
    ssoJwtSecret: process.env.SSO_JWT_SECRET || "",
    samlEntryPoint: process.env.SAML_ENTRY_POINT || "",
    samlIssuer: process.env.SAML_ISSUER || "hephaestus",
    samlAudience: process.env.SAML_AUDIENCE || "hephaestus-users",
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,https://hephaestus-web.onrender.com",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
    providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS || 120000)
  };
}

