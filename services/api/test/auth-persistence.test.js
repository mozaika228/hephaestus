import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

let tempDir;
let baseUrl;
let server;
let createApp;
let database;
let originalFetch;

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hephaestus-auth-"));
  process.env.SQLITE_DB_PATH = path.join(tempDir, "hephaestus.db");
  process.env.UPLOADS_DIR = path.join(tempDir, "uploads");
  process.env.OPENAI_API_KEY = "test-api-key";
  process.env.AI_SERVICE_URL = "http://127.0.0.1:1";
  process.env.HEPHAESTUS_DISABLE_AUTOSTART = "true";
  process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000,https://hephaestus-web.onrender.com";

  ({ createApp } = await import("../src/index.js"));
  ({ getDb: database } = await import("../src/store/db.js"));
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (database) database().close();
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  if (originalFetch) globalThis.fetch = originalFetch;
});

async function request(route, { method = "GET", token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : {} };
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch { /* The child API is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Restarted API did not become healthy.");
}

test("account ownership, streaming persistence, and files survive an API restart", async () => {
  const corsPreflight = await request("/auth/register", {
    method: "OPTIONS",
    headers: {
      Origin: "https://hephaestus-web.onrender.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(corsPreflight.response.status, 204);
  assert.equal(corsPreflight.response.headers.get("access-control-allow-origin"), "https://hephaestus-web.onrender.com");
  assert.equal(corsPreflight.response.headers.get("access-control-allow-credentials"), "true");

  const unauthenticated = await request("/conversations");
  assert.equal(unauthenticated.response.status, 401);

  const accountA = await request("/auth/register", { method: "POST", body: { email: "a@example.com", password: "correct horse battery staple" } });
  const accountB = await request("/auth/register", { method: "POST", body: { email: "b@example.com", password: "another secure password" } });
  assert.equal(accountA.response.status, 201);
  assert.equal(accountB.response.status, 201);
  const tokenA = accountA.payload.token;
  const tokenB = accountB.payload.token;
  assert.ok(tokenA && tokenB && tokenA !== tokenB);

  const previousRender = process.env.RENDER;
  process.env.RENDER = "true";
  const browserAccount = await request("/auth/register", { method: "POST", body: { email: "web@example.com", password: "browser session secret", client: "web" } });
  if (previousRender === undefined) delete process.env.RENDER;
  else process.env.RENDER = previousRender;
  assert.equal(browserAccount.response.status, 201);
  assert.equal(browserAccount.payload.token, undefined);
  const setCookie = browserAccount.response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=None/);
  assert.match(setCookie, /Secure/);
  const browserCookie = setCookie.split(";")[0];
  assert.equal((await request("/auth/me", { headers: { Cookie: browserCookie } })).response.status, 200);

  const shortPassword = await request("/auth/register", { method: "POST", body: { email: "short@example.com", password: "short" } });
  assert.equal(shortPassword.response.status, 400);

  const created = await request("/conversations", { method: "POST", token: tokenA, body: { provider: "openai" } });
  const conversationId = created.payload.conversation.id;
  const foreignConversation = await request(`/conversations/${conversationId}`, { token: tokenB });
  assert.equal(foreignConversation.response.status, 404);

  const task = await request("/planner/tasks", { method: "POST", token: tokenA, body: { title: "Private task" } });
  const foreignTasks = await request("/planner/tasks", { token: tokenB });
  assert.deepEqual(foreignTasks.payload.tasks, []);
  assert.equal((await request(`/planner/tasks/${task.payload.task.id}`, { token: tokenB })).response.status, 404);

  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:1/")) return new Response("", { status: 503 });
    if (url === "https://api.openai.com/v1/responses") {
      return new Response([
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Persisted answer" })}\n\n`,
        `data: ${JSON.stringify({ type: "response.completed", response: { id: "response-test" } })}\n\n`
      ].join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return originalFetch(input, init);
  };

  const streamResponse = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, provider: "openai", message: "Say hello" })
  });
  const streamText = await streamResponse.text();
  assert.match(streamText, /Persisted answer/);

  process.env.PROVIDER_TIMEOUT_MS = "150";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:1/")) return new Response("", { status: 503 });
    if (url === "https://api.openai.com/v1/responses") {
      return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
    }
    return originalFetch(input, init);
  };
  const timeoutResponse = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, provider: "openai", message: "This should time out" })
  });
  const timeoutText = await timeoutResponse.text();
  assert.match(timeoutText, /provider_timeout/);
  process.env.PROVIDER_TIMEOUT_MS = "120000";
  globalThis.fetch = originalFetch;

  const form = new FormData();
  form.append("file", new Blob(["private notes"], { type: "text/plain" }), "notes.txt");
  form.append("conversationId", conversationId);
  const upload = await request("/files/ingest", { method: "POST", token: tokenA, body: form });
  assert.equal(upload.response.status, 200);
  const fileId = upload.payload.file.id;
  assert.equal((await request(`/files/${fileId}`, { token: tokenB })).response.status, 404);

  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  server = null;
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: path.resolve("."),
    env: { ...process.env, PORT: String(port), HEPHAESTUS_DISABLE_AUTOSTART: "false" },
    stdio: "ignore"
  });
  try {
    const restartedUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(restartedUrl);
    const restored = await fetch(`${restartedUrl}/conversations/${conversationId}`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const restoredPayload = await restored.json();
    assert.equal(restored.status, 200);
    assert.deepEqual(restoredPayload.messages.slice(0, 2).map((message) => message.content), ["Say hello", "Persisted answer"]);
    assert.equal(restoredPayload.messages.at(-1).status, "failed");
    assert.match(restoredPayload.messages.at(-1).content, /Provider timeout/);
    assert.equal(restoredPayload.files.length, 1);
    assert.equal(restoredPayload.files[0].id, fileId);
    assert.equal((await fetch(`${restartedUrl}/conversations/${conversationId}`, { headers: { Authorization: `Bearer ${tokenB}` } })).status, 404);

    const deletion = await fetch(`${restartedUrl}/conversations/${conversationId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(deletion.status, 200);
    await assert.rejects(fs.access(path.join(process.env.UPLOADS_DIR, `${fileId}-notes.txt`)));
    const logout = await fetch(`${restartedUrl}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` } });
    assert.equal(logout.status, 200);
    assert.equal((await fetch(`${restartedUrl}/auth/me`, { headers: { Authorization: `Bearer ${tokenB}` } })).status, 401);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
});
