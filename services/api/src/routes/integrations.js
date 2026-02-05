const integrations = [
  { id: "slack", name: "Slack", status: "inactive" },
  { id: "notion", name: "Notion", status: "inactive" },
  { id: "google", name: "Google Workspace", status: "inactive" }
];

export function registerIntegrationRoutes(app) {
  app.get("/integrations", (req, res) => {
    res.json({ ok: true, integrations });
  });

  app.post("/integrations/:id/connect", (req, res) => {
    const integration = integrations.find((item) => item.id === req.params.id);
    if (!integration) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    integration.status = "pending";
    res.json({ ok: true, integration, message: "Integration connect placeholder." });
  });
}
