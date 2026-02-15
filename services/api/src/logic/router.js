const intents = {
  chat: ["hello", "hi", "привет", "здарова", "с?лем"],
  code: ["code", "bug", "refactor", "function", "api", "кoд", "код", "ошибка"],
  planner: ["plan", "task", "schedule", "todo", "план", "задача", "распис"],
  integration: ["slack", "notion", "google", "integration", "интегра"],
  file_analysis: ["file", "image", "audio", "video", "analyze", "файл", "анализ", "аудио", "видео"]
};

function scoreIntent(message, words) {
  let score = 0;
  for (const word of words) {
    if (message.includes(word)) score += 1;
  }
  return score;
}

export function routeIntent({ message = "", fileId }) {
  if (fileId) {
    return { intent: "file_analysis", confidence: 1, reason: "file_id_present" };
  }

  const text = String(message || "").toLowerCase();
  let bestIntent = "chat";
  let bestScore = 0;

  for (const [intent, words] of Object.entries(intents)) {
    const current = scoreIntent(text, words);
    if (current > bestScore) {
      bestScore = current;
      bestIntent = intent;
    }
  }

  if (bestScore === 0) {
    return { intent: "chat", confidence: 0.35, reason: "default_chat" };
  }

  const confidence = Math.min(0.95, 0.4 + bestScore * 0.2);
  return { intent: bestIntent, confidence, reason: "keyword_match" };
}

export function routeFileIntent({ mime = "" }) {
  if (mime.startsWith("image/")) {
    return { intent: "file_analysis_image", confidence: 0.95, reason: "mime_image" };
  }
  if (mime.startsWith("audio/")) {
    return { intent: "file_analysis_audio", confidence: 0.95, reason: "mime_audio" };
  }
  if (mime.startsWith("video/")) {
    return { intent: "file_analysis_video", confidence: 0.95, reason: "mime_video" };
  }
  return { intent: "file_analysis_document", confidence: 0.8, reason: "mime_generic" };
}
