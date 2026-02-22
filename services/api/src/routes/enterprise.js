import crypto from "node:crypto";
import { errorJson } from "../http.js";
import { createId } from "../store/ids.js";
import { summarizeAnalytics } from "../store/analytics.js";
import { createSsoSession, getSsoSession, updateSsoSession } from "../store/sso.js";

const ssoProviders = [
  { id: "saml", name: "SAML 2.0", status: "available" },
  { id: "oidc", name: "OpenID Connect", status: "planned" }
];

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function createSsoToken({ sessionId, email, secret }) {
  const payload = {
    sub: sessionId,
    email,
    iat: Math.floor(Date.now() / 1000)
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret || "hephaestus-dev-secret")
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function registerEnterpriseRoutes(app, config) {
  app.get("/enterprise/sso/providers", (req, res) => {
    res.json({ ok: true, enabled: config.enableSso, providers: ssoProviders });
  });

  app.post("/enterprise/sso/saml/start", (req, res) => {
    if (!config.enableSso) {
      res.status(403).json(errorJson("feature_disabled", "SSO is disabled."));
      return;
    }

    const state = createId("sso_state");
    const session = createSsoSession({
      id: state,
      provider: "saml",
      email: "",
      status: "started",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const entryPoint = config.samlEntryPoint || "https://idp.example.com/saml/login";
    const redirectUrl = `${entryPoint}?issuer=${encodeURIComponent(config.samlIssuer)}&audience=${encodeURIComponent(config.samlAudience)}&state=${encodeURIComponent(state)}`;
    res.json({ ok: true, state, redirectUrl, session });
  });

  app.post("/enterprise/sso/saml/callback", (req, res) => {
    if (!config.enableSso) {
      res.status(403).json(errorJson("feature_disabled", "SSO is disabled."));
      return;
    }

    const { state, email } = req.body || {};
    if (!state || typeof state !== "string") {
      res.status(400).json(errorJson("invalid_request", "state is required."));
      return;
    }
    if (!email || typeof email !== "string") {
      res.status(400).json(errorJson("invalid_request", "email is required."));
      return;
    }

    const session = getSsoSession(state);
    if (!session) {
      res.status(404).json(errorJson("not_found", "SSO session not found."));
      return;
    }

    const next = updateSsoSession(state, { email: email.trim().toLowerCase(), status: "authenticated" });
    const token = createSsoToken({
      sessionId: next.id,
      email: next.email,
      secret: config.ssoJwtSecret
    });
    res.json({ ok: true, session: next, token });
  });

  app.get("/enterprise/analytics/summary", (req, res) => {
    const since = typeof req.query.since === "string" ? req.query.since : "";
    const until = typeof req.query.until === "string" ? req.query.until : "";
    const summary = summarizeAnalytics({ since, until });
    res.json({ ok: true, summary });
  });
}
