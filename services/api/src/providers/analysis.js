import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const OPENAI_RESPONSES = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTIONS = "https://api.openai.com/v1/audio/transcriptions";

function extractTextFromResponse(payload) {
  const output = payload.output || [];
  const parts = [];

  for (const item of output) {
    if (item.type !== "message") continue;
    const content = item.content || [];
    for (const chunk of content) {
      if (chunk.type === "output_text") {
        parts.push(chunk.text);
      }
    }
  }

  return parts.join("").trim();
}

async function callOpenAIResponses({ config, input, instructions }) {
  const response = await fetch(OPENAI_RESPONSES, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiAnalysisModel || config.openaiModel || "gpt-4o-mini",
      input,
      instructions: instructions || config.instructions || "",
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text };
  }

  const payload = await response.json();
  return { ok: true, text: extractTextFromResponse(payload), raw: payload };
}

async function callAzureResponses({ config, input, instructions }) {
  const base = config.azureEndpoint.replace(/\/$/, "");
  const pathUrl = `${base}/openai/v1/responses`;
  const url = config.azureApiVersion ? `${pathUrl}?api-version=${config.azureApiVersion}` : pathUrl;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.azureApiKey
    },
    body: JSON.stringify({
      model: config.azureDeployment,
      input,
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text };
  }

  const payload = await response.json();
  return { ok: true, text: extractTextFromResponse(payload), raw: payload };
}

async function transcribeOpenAI({ config, filePath, filename, mimeType }) {
  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("model", config.openaiTranscribeModel || "gpt-4o-mini-transcribe");
  form.append("file", new Blob([fileBuffer], { type: mimeType }), filename);

  const response = await fetch(OPENAI_TRANSCRIPTIONS, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text };
  }

  const payload = await response.json();
  return { ok: true, text: payload.text || "", raw: payload };
}

function buildImageInput({ prompt, imageFileId, imageDataUrl }) {
  const content = [
    { type: "input_text", text: prompt }
  ];

  if (imageFileId) {
    content.push({ type: "input_image", file_id: imageFileId, detail: "auto" });
  } else if (imageDataUrl) {
    content.push({ type: "input_image", image_url: imageDataUrl, detail: "auto" });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

function buildFileInput({ prompt, fileId, textSnippet }) {
  const content = [
    { type: "input_text", text: prompt }
  ];

  if (fileId) {
    content.push({ type: "input_file", file_id: fileId });
  }

  if (textSnippet) {
    content.push({ type: "input_text", text: textSnippet });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

async function analyzeWithProvider({ config, input, instructions }) {
  const provider = (config.provider || "openai").toLowerCase();
  if (provider === "azure") {
    return callAzureResponses({ config, input, instructions });
  }
  if (provider === "openai") {
    return callOpenAIResponses({ config, input, instructions });
  }
  return { ok: false, error: "Provider does not support analysis yet." };
}

async function extractVideoFrames(localPath) {
  const outputDir = path.join(path.dirname(localPath), "frames");
  await fs.mkdir(outputDir, { recursive: true });
  const filename = path.basename(localPath, path.extname(localPath));
  const outputPattern = path.join(outputDir, `${filename}-%02d.jpg`);

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      localPath,
      "-vf",
      "fps=1/3",
      "-frames:v",
      "3",
      outputPattern
    ]);

    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: "ffmpeg failed" });
        return;
      }
      const files = await fs.readdir(outputDir);
      const frames = files
        .filter((file) => file.startsWith(filename))
        .map((file) => path.join(outputDir, file));
      resolve({ ok: true, frames });
    });

    ffmpeg.on("error", () => {
      resolve({ ok: false, error: "ffmpeg not available" });
    });
  });
}

export async function analyzeFile({ record, config }) {
  const mime = record.type || "";

  if (mime.startsWith("image/")) {
    let imageDataUrl = null;
    if (!record.providerFileId && record.localPath) {
      const buffer = await fs.readFile(record.localPath);
      imageDataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    }
    const input = buildImageInput({
      prompt: "Analyze this image. Provide a concise description, list key objects, detect any visible text, and summarize the scene.",
      imageFileId: record.providerFileId,
      imageDataUrl
    });
    return analyzeWithProvider({ config, input });
  }

  if (mime.startsWith("audio/")) {
    if (config.provider !== "openai") {
      return { ok: false, error: "Audio transcription is only wired for OpenAI currently." };
    }
    if (!record.localPath) {
      return { ok: false, error: "Audio file missing on disk." };
    }
    return transcribeOpenAI({
      config,
      filePath: record.localPath,
      filename: record.name,
      mimeType: record.type
    });
  }

  if (mime.startsWith("video/")) {
    if (!record.localPath) {
      return { ok: false, error: "Video file missing on disk." };
    }

    const frames = await extractVideoFrames(record.localPath);
    if (!frames.ok) {
      return { ok: false, error: frames.error || "Video extraction failed" };
    }

    const images = [];
    for (const framePath of frames.frames.slice(0, 3)) {
      const buffer = await fs.readFile(framePath);
      images.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
    }

    const prompt = "Analyze these video frames. Provide a concise scene summary, describe actions, and list notable objects.";
    const input = [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...images.map((image) => ({ type: "input_image", image_url: image, detail: "auto" }))
        ]
      }
    ];

    return analyzeWithProvider({ config, input });
  }

  const prompt = "Analyze this file. Provide a concise summary, key entities, and actionable insights.";
  let textSnippet = null;
  if (!record.providerFileId && record.localPath) {
    const buffer = await fs.readFile(record.localPath);
    const text = buffer.toString("utf-8");
    textSnippet = text.slice(0, 8000);
  }
  const input = buildFileInput({
    prompt,
    fileId: record.providerFileId,
    textSnippet
  });
  return analyzeWithProvider({ config, input });
}
