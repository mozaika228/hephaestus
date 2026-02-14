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
import { createRateLimiter } from "./http.js";

const config = getConfig();
const configIssues = validateConfig(config);

if (configIssues.length > 0) {
  log("error", "invalid_configuration", { issues: configIssues });
  process.exit(1);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const allowedOrigins = config.corsAllowedOrigins
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const corsConfig = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS blocked"));
  }
};

app.use(cors(corsConfig));
app.disable("x-powered-by");
app.use(createRequestLogger());
app.use(createRateLimiter(config));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "on");
  next();
});
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
