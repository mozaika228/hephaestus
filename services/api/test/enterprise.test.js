import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createTestSession } from "./helpers.js";

process.env.HEPHAESTUS_DISABLE_AUTOSTART = "true";
process.env.SQLITE_DB_PATH = ":memory:";

const { createApp } = await import("../src/index.js");

function baseConfig() {
  return {
    provider: "openai",
    openaiApiKey: "test-key",
    openaiModel: "gpt-4o-mini",
    openaiAnalysisModel: "",
    openaiTranscribeModel: "gpt-4o-mini-transcribe",
    instructions: "",
    ollamaEndpoint: "",
    aiServiceUrl: "http://localhost:8000",
    dbPath: ":memory:",
    enableSso: true,
    ssoJwtSecret: "test-secret",
    samlEntryPoint: "https://idp.example.com/saml/login",
    samlIssuer: "hephaestus",
    samlAudience: "hephaestus-users",
    corsAllowedOrigins: "*",
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000
  };
}

test("enterprise SSO flow issues token", async () => {
  const app = createApp(baseConfig());
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const token = await createTestSession(base, "sso-test@example.com");

  try {
    const startResp = await fetch(`${base}/enterprise/sso/saml/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}"
    });
    assert.equal(startResp.status, 200);
    const startPayload = await startResp.json();
    assert.equal(startPayload.ok, true);
    assert.ok(startPayload.state);

    const callbackResp = await fetch(`${base}/enterprise/sso/saml/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state: startPayload.state, email: "admin@example.com" })
    });
    assert.equal(callbackResp.status, 200);
    const callbackPayload = await callbackResp.json();
    assert.equal(callbackPayload.ok, true);
    assert.ok(callbackPayload.token);
  } finally {
    server.close();
  }
});

test("analytics summary collects request events", async () => {
  const app = createApp(baseConfig());
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const token = await createTestSession(base, "analytics-test@example.com");

  try {
    await fetch(`${base}/planner/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    await fetch(`${base}/integrations`, { headers: { Authorization: `Bearer ${token}` } });

    const resp = await fetch(`${base}/enterprise/analytics/summary`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(resp.status, 200);
    const payload = await resp.json();
    assert.equal(payload.ok, true);
    assert.ok(payload.summary.totalRequests >= 2);
  } finally {
    server.close();
  }
});
