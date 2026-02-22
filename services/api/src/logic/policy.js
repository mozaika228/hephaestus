const knownProviders = ["openai", "ollama"];

const intentPreference = {
  chat: ["openai", "ollama"],
  code: ["openai", "ollama"],
  planner: ["openai", "ollama"],
  integration: ["openai", "ollama"],
  file_analysis: ["openai", "ollama"],
  file_analysis_image: ["openai", "ollama"],
  file_analysis_audio: ["openai"],
  file_analysis_video: ["openai", "ollama"],
  file_analysis_document: ["openai", "ollama"]
};

function getAvailableProviders(config) {
  const available = [];

  if (config.openaiApiKey) available.push("openai");
  if (config.ollamaEndpoint) available.push("ollama");

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
