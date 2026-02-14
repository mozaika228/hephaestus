import crypto from "node:crypto";

export function log(level, message, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(payload));
}

export function createRequestLogger() {
  return (req, res, next) => {
    const requestId = crypto.randomUUID();
    req.requestId = requestId;
    const start = Date.now();

    res.on("finish", () => {
      log("info", "http_request", {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start
      });
    });

    next();
  };
}
