import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

process.env.HEPHAESTUS_DISABLE_AUTOSTART = "true";
process.env.SQLITE_DB_PATH = ":memory:";

const { createApp } = await import("../src/index.js");

function baseConfig(orchestratorUrl) {
  return {
    provider: "openai",
    openaiApiKey: "test-key",
    openaiModel: "gpt-4o-mini",
    openaiAnalysisModel: "",
    openaiTranscribeModel: "gpt-4o-mini-transcribe",
    instructions: "",
    ollamaEndpoint: "",
    aiServiceUrl: "http://localhost:8000",
    orchestratorUrl,
    dbPath: ":memory:",
    enableSso: false,
    ssoJwtSecret: "",
    samlEntryPoint: "",
    samlIssuer: "hephaestus",
    samlAudience: "hephaestus-users",
    corsAllowedOrigins: "*",
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000
  };
}

test("orchestrator route proxies successful run", async () => {
  const upstream = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/graph/run") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, final_answer: "done" }));
      return;
    }
    res.writeHead(404).end();
  });
  upstream.listen(0);
  await once(upstream, "listening");
  const upstreamPort = upstream.address().port;

  const app = createApp(baseConfig(`http://127.0.0.1:${upstreamPort}`));
  const server = app.listen(0);
  await once(server, "listening");
  const port = server.address().port;

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/orchestrator/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test prompt" })
    });
    assert.equal(resp.status, 200);
    const payload = await resp.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.result.final_answer, "done");
  } finally {
    server.close();
    upstream.close();
  }
});
