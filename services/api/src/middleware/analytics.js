import { createId } from "../store/ids.js";
import { createAnalyticsEvent } from "../store/analytics.js";
import { readBearerToken } from "./auth.js";
import { getUserForToken } from "../store/auth.js";

export function createAnalyticsTracker(config) {
  return (req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
      const excluded = req.path.startsWith("/health") || req.path.startsWith("/enterprise/analytics");
      if (excluded) return;

      createAnalyticsEvent({
        id: createId("evt"),
        ownerId: req.user?.id || getUserForToken(readBearerToken(req))?.id || null,
        requestId: req.requestId || null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        provider: config.provider || "",
        createdAt: new Date().toISOString()
      });
    });

    next();
  };
}
