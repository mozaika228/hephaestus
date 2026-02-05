import express from "express";
import cors from "cors";
import multer from "multer";

import { registerChatRoutes } from "./routes/chat.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerPlannerRoutes } from "./routes/planner.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerJobRoutes } from "./routes/jobs.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
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
  console.log(`Hephaestus API listening on ${port}`);
});
