import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createTestSession } from "./helpers.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_FIXTURE = "UEsDBBQAAAAIADtdPl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAO10+XZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIADtdPl2gUP3orAAAAOQAAAARAAAAd29yZC9kb2N1bWVudC54bWxFjjGPwjAMhf9KlP2a3g0IVW0ZON16yyGxhsTQSo0d2eYK/54EBpbv6cnWp9fvbmkx/8AyEw72s2mtAQwUZ7wM9vD387G1RtRj9AshDPYOYndjv3aRwjUBqikClG4d7KSaO+ckTJC8NJQBy+1MnLyWyhe3EsfMFECk+NPivtp245Kf0VblieK9Zq7gCh2/f/dHAzdlH7RMNAqiJk/sBXpXHyr5yfzkS+LeA8cHUEsBAhQAFAAAAAgAO10+XXluM9foAAAArQEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAUAAAACAA7XT5dm/036q0AAAApAQAACwAAAAAAAAAAAAAAgAEZAQAAX3JlbHMvLnJlbHNQSwECFAAUAAAACAA7XT5doFD96KwAAADkAAAAEQAAAAAAAAAAAAAAgAHvAQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAygIAAAAA";

let tempDir;
let server;
let baseUrl;
let token;
let originalFetch;
let database;
let providerMessages = [];

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hephaestus-docx-"));
  process.env.HEPHAESTUS_DISABLE_AUTOSTART = "true";
  process.env.SQLITE_DB_PATH = path.join(tempDir, "hephaestus.db");
  process.env.UPLOADS_DIR = path.join(tempDir, "uploads");
  process.env.HEPHAESTUS_PROVIDER = "ollama";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
  process.env.OLLAMA_MODEL = "mistral:latest";
  process.env.OPENAI_API_KEY = "";
  process.env.AI_SERVICE_URL = "http://logic.test";

  const { createApp } = await import("../src/index.js");
  ({ getDb: database } = await import("../src/store/db.js"));
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = await createTestSession(baseUrl, "docx-test@example.com");
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (database) database().close();
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

test("DOCX upload extracts text for Ollama chat and file analysis", async () => {
  const conversationResponse = await fetch(`${baseUrl}/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "ollama" })
  });
  const conversationPayload = await conversationResponse.json();
  assert.equal(conversationResponse.status, 201);

  const form = new FormData();
  form.append("conversationId", conversationPayload.conversation.id);
  form.append("file", new Blob([Buffer.from(DOCX_FIXTURE, "base64")], { type: DOCX_MIME }), "sample.docx");
  const uploadResponse = await fetch(`${baseUrl}/files/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const uploadPayload = await uploadResponse.json();
  assert.equal(uploadResponse.status, 200, JSON.stringify(uploadPayload));
  assert.equal(uploadPayload.file.type, DOCX_MIME);
  assert.equal(uploadPayload.file.extractedText, undefined);

  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "http://logic.test/logic/decision") {
      return Response.json({
        route: { intent: "file_analysis_document", confidence: 1, reason: "test" },
        policy: { provider: "ollama", fallbackProviders: [], availableProviders: ["ollama"], reason: "test" }
      });
    }
    if (url === "http://127.0.0.1:11434/api/chat") {
      const body = JSON.parse(init.body);
      providerMessages.push(body.messages);
      if (body.stream) {
        return new Response(`${JSON.stringify({ message: { content: "DOCX answer received." }, done: true })}\n`, {
          headers: { "Content-Type": "application/x-ndjson" }
        });
      }
      return Response.json({ message: { content: "DOCX summary extracted." }, done: true });
    }
    return originalFetch(input, init);
  };

  const chatResponse = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: conversationPayload.conversation.id,
      provider: "ollama",
      message: "Summarize this document.",
      attachmentId: uploadPayload.file.id
    })
  });
  const chatStream = await chatResponse.text();
  assert.equal(chatResponse.status, 200);
  assert.match(chatStream, /DOCX answer received/);
  assert.match(JSON.stringify(providerMessages.at(-1)), /DOCX extraction test phrase/);

  const analysisResponse = await fetch(`${baseUrl}/files/${uploadPayload.file.id}/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const analysisPayload = await analysisResponse.json();
  assert.equal(analysisResponse.status, 200);
  assert.equal(analysisPayload.analysis.text, "DOCX summary extracted.");
  assert.match(JSON.stringify(providerMessages.at(-1)), /DOCX extraction test phrase/);
});

test("invalid DOCX uploads return a clear client error", async () => {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04])], { type: DOCX_MIME }), "invalid.docx");
  const response = await fetch(`${baseUrl}/files/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "invalid_document");
});
