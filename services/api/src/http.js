const providerErrorCodeMap = {
  400: "provider_bad_request",
  401: "provider_auth",
  402: "provider_quota",
  403: "provider_forbidden",
  404: "provider_not_found",
  408: "provider_timeout",
  409: "provider_conflict",
  422: "provider_unprocessable",
  429: "provider_rate_limit",
  500: "provider_internal",
  502: "provider_bad_gateway",
  503: "provider_unavailable",
  504: "provider_timeout"
};

export function normalizeProviderError(statusCode) {
  return providerErrorCodeMap[statusCode] || "provider_error";
}

export function errorJson(code, message, details = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...details
    }
  };
}

export function createRateLimiter(config) {
  const bucket = new Map();
  const windowMs = config.rateLimitWindowMs;
  const max = config.rateLimitMax;

  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const hit = bucket.get(key);

    if (!hit || now >= hit.resetAt) {
      bucket.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (hit.count >= max) {
      res.status(429).json(
        errorJson("rate_limited", "Too many requests. Retry later.", {
          retryAfterMs: hit.resetAt - now
        })
      );
      return;
    }

    hit.count += 1;
    next();
  };
}
