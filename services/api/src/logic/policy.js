const knownProviders = ["openai", "azure", "local", "custom"];

const intentPreference = {
  chat: ["openai", "azure", "local", "custom"],
  code: ["openai", "azure", "local", "custom"],
  planner: ["openai", "azure", "local", "custom"],
  integration: ["custom", "openai", "azure", "local"],
  file_analysis: ["openai", "azure", "custom", "local"],
  file_analysis_image: ["openai", "azure", "custom", "local"],
  file_analysis_audio: ["openai", "azure"],
  file_analysis_video: ["openai", "azure", "custom"],
  file_analysis_document: ["openai", "azure", "custom", "local"]
};

function getAvailableProviders(config) {
  const available = [];

  if (config.openaiApiKey) available.push("openai");
  if (config.azureApiKey && config.azureEndpoint && config.azureDeployment) available.push("azure");
  if (config.localEndpoint) available.push("local");
  if (config.customEndpoint) available.push("custom");

  return available;
}

export function resolveProviderPolicy({ config, intent, requestedProvider }) {
  const available = getAvailableProviders(config);
  const requested = (requestedProvider || "").toLowerCase();
  const configured = (config.provider || "openai").toLowerCase();

  if (requested && knownProviders.includes(requested) && available.includes(requested)) {
    return {
      provider: requested,
      fallbackProviders: available.filter((item) => item !== requested),
      availableProviders: available,
      reason: "requested_provider_available"
    };
  }

  if (available.includes(configured)) {
    return {
      provider: configured,
      fallbackProviders: available.filter((item) => item !== configured),
      availableProviders: available,
      reason: requested ? "requested_provider_unavailable_use_configured" : "configured_provider_available"
    };
  }

  const preferredOrder = intentPreference[intent] || intentPreference.chat;
  const picked = preferredOrder.find((item) => available.includes(item));

  if (picked) {
    return {
      provider: picked,
      fallbackProviders: available.filter((item) => item !== picked),
      availableProviders: available,
      reason: "intent_policy_selected"
    };
  }

  return {
    provider: configured,
    fallbackProviders: [],
    availableProviders: [],
    reason: "no_provider_available"
  };
}
