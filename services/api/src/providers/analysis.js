function buildAnalyzePayload({ record, config }) {
  return {
    record: {
      id: record.id || null,
      name: record.name || null,
      type: record.type || null,
      size: Number.isFinite(record.size) ? record.size : null,
      providerFileId: record.providerFileId || null,
      localPath: record.localPath || null
    },
    config: {
      provider: config.provider || "openai",
      openaiApiKey: config.openaiApiKey || "",
      openaiModel: config.openaiModel || "gpt-4o-mini",
      openaiAnalysisModel: config.openaiAnalysisModel || "",
      openaiTranscribeModel: config.openaiTranscribeModel || "gpt-4o-mini-transcribe",
      instructions: config.instructions || "",
      azureApiKey: config.azureApiKey || "",
      azureEndpoint: config.azureEndpoint || "",
      azureDeployment: config.azureDeployment || "",
      azureApiVersion: config.azureApiVersion || "",
      localEndpoint: config.localEndpoint || "",
      customEndpoint: config.customEndpoint || "",
      customAuthHeader: config.customAuthHeader || "",
      customAuthValue: config.customAuthValue || ""
    }
  };
}

function normalizeError(error) {
  return typeof error === "string" && error.trim() ? error : "Analysis request failed.";
}

export async function analyzeFile({ record, config }) {
  const url = `${config.aiServiceUrl.replace(/\/$/, "")}/analyze`;
  const payload = buildAnalyzePayload({ record, config });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `AI service analyze failed: ${text}` };
    }

    const parsed = await response.json();
    if (parsed?.analysis) return parsed.analysis;
    if (parsed?.metadata) return { ok: true, text: JSON.stringify(parsed.metadata) };
    return { ok: false, error: "AI service returned invalid analyze response." };
  } catch (error) {
    return { ok: false, error: normalizeError(error?.message) };
  }
}
