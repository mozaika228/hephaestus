import { errorJson } from "../http.js";

export function registerOrchestratorRoutes(app, config) {
  app.post("/orchestrator/run", async (req, res) => {
    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

    if (!prompt) {
      res.status(400).json(errorJson("invalid_request", "prompt is required."));
      return;
    }

    try {
      const response = await fetch(`${config.orchestratorUrl.replace(/\/$/, "")}/v1/graph/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          session_id: sessionId || undefined,
          metadata: { source: "api" }
        })
      });

      if (!response.ok) {
        const text = await response.text();
        res.status(502).json(errorJson("orchestrator_error", "Orchestrator call failed.", { upstream: text }));
        return;
      }

      const payload = await response.json();
      res.json({ ok: true, result: payload });
    } catch (error) {
      res.status(502).json(
        errorJson("orchestrator_unreachable", "Orchestrator is unreachable.", {
          message: error?.message || ""
        })
      );
    }
  });
}
