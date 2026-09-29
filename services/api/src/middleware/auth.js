import { errorJson } from "../http.js";
import { getUserForToken } from "../store/auth.js";

export function readBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  if (match?.[1]) return match[1];
  const cookie = (req.get("cookie") || "").split(";").map((item) => item.trim()).find((item) => item.startsWith("hephaestus_session="));
  const token = cookie?.slice("hephaestus_session=".length);
  return token && /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
}

export function requireAuth(req, res, next) {
  const user = getUserForToken(readBearerToken(req));
  if (!user) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json(errorJson("unauthorized", "Sign in to access this resource."));
    return;
  }
  req.user = user;
  next();
}
