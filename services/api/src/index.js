import express from "express";
import cors from "cors";
import multer from "multer";

import { registerChatRoutes } from "./routes/chat.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerPlannerRoutes } from "./routes/planner.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { getConfig } from "./config.js";
import { validateConfig } from "./env.js";
import { createRequestLogger, log } from "./logger.js";

const config = getConfig();
const configIssues = validateConfig(config);

if (configIssues.length > 0) {
  log("error", "invalid_configuration", { issues: configIssues });
  process.exit(1);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(createRequestLogger());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ status: "Hephaestus API online" });
});

registerChatRoutes(app);
registerFileRoutes(app, upload);
registerPlannerRoutes(app);
registerIntegrationRoutes(app);
registerJobRoutes(app);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  log("info", "api_started", {
    port: Number(port),
    provider: config.provider,
    openaiModel: config.openaiModel || "",
    azureDeployment: config.azureDeployment || "",
    aiServiceUrl: config.aiServiceUrl
  });
});
