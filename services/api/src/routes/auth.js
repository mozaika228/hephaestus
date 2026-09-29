import argon2 from "argon2";
import { createId } from "../store/ids.js";
import { createSession, createUser, getUserByEmail, revokeSession } from "../store/auth.js";
import { errorJson } from "../http.js";
import { readBearerToken, requireAuth } from "../middleware/auth.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const argonOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const attempts = new Map();
const dummyPasswordHash = argon2.hash("not-a-real-user-password", argonOptions);

function setSessionCookie(req, res, session) {
  const maxAge = Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER) || req.secure;
  const sameSite = secure ? "None" : "Lax";
  res.setHeader("Set-Cookie", `hephaestus_session=${session.token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
}

function authResponse(req, res, user, session, status = 200) {
  res.setHeader("Cache-Control", "no-store");
  if (req.body?.client === "web") {
    setSessionCookie(req, res, session);
    res.status(status).json({ ok: true, user, expiresAt: session.expiresAt });
    return;
  }
  res.status(status).json({ ok: true, user, ...session });
}

function limitAuthAttempts(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  if (attempts.size > 10000) {
    for (const [address, entry] of attempts) if (now >= entry.resetAt) attempts.delete(address);
  }
  const current = attempts.get(key);
  if (!current || now >= current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    next();
    return;
  }
  if (current.count >= 12) {
    res.status(429).json(errorJson("rate_limited", "Too many authentication attempts. Try again later."));
    return;
  }
  current.count += 1;
  next();
}

export function registerAuthRoutes(app) {
  app.post("/auth/register", limitAuthAttempts, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!emailPattern.test(email) || email.length > 254) {
      res.status(400).json(errorJson("invalid_request", "Enter a valid email address."));
      return;
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 128) {
      res.status(400).json(errorJson("invalid_request", "Password must be 12–128 bytes long."));
      return;
    }
    if (getUserByEmail(email)) {
      res.status(409).json(errorJson("email_in_use", "An account with this email already exists."));
      return;
    }
    try {
      const now = new Date().toISOString();
      const user = createUser({ id: createId("user"), email, passwordHash: await argon2.hash(password, argonOptions), createdAt: now });
      authResponse(req, res, user, createSession(user.id), 201);
    } catch (error) {
      if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
        res.status(409).json(errorJson("email_in_use", "An account with this email already exists."));
        return;
      }
      res.status(500).json(errorJson("internal_error", "Could not create account."));
    }
  });

  app.post("/auth/login", limitAuthAttempts, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const userRecord = email.length <= 254 ? getUserByEmail(email) : null;
    const passwordHash = userRecord?.passwordHash || await dummyPasswordHash;
    const valid = password.length <= 128 && await argon2.verify(passwordHash, password).catch(() => false) && Boolean(userRecord);
    if (!valid) {
      res.status(401).json(errorJson("invalid_credentials", "Email or password is incorrect."));
      return;
    }
    const user = { id: userRecord.id, email: userRecord.email, createdAt: userRecord.createdAt };
    authResponse(req, res, user, createSession(user.id));
  });

  app.post("/auth/logout", requireAuth, (req, res) => {
    const token = readBearerToken(req);
    if (token) revokeSession(token);
    if (req.get("cookie")?.includes("hephaestus_session=")) {
      const secure = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
      const sameSite = secure ? "None" : "Lax";
      res.setHeader("Set-Cookie", `hephaestus_session=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure ? "; Secure" : ""}`);
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  app.get("/auth/me", requireAuth, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, user: req.user });
  });
}
