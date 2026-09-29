export async function deleteOpenAIFile(providerFileId, config) {
  if (!providerFileId) return true;
  if (!config.openaiApiKey) return false;
  try {
    const response = await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(providerFileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
      signal: AbortSignal.timeout(config.providerTimeoutMs)
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
