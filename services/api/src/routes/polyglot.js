import { errorJson } from "../http.js";

export function registerPolyglotRoutes(app, config) {
  app.get("/polyglot/health", async (req, res) => {
    const javaUrl = `${config.enterpriseJavaUrl.replace(/\/$/, "")}/health`;
    const cppUrl = `${config.runtimeCppUrl.replace(/\/$/, "")}/health`;

    const check = async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return { ok: false, status: response.status };
        const payload = await response.json().catch(() => ({}));
        return { ok: true, payload };
      } catch (error) {
        return { ok: false, error: error?.message || "unreachable" };
      }
    };

    const [java, cpp] = await Promise.all([check(javaUrl), check(cppUrl)]);
    res.json({ ok: true, java, cpp });
  });

  app.post("/polyglot/policy/validate", async (req, res) => {
    try {
      const response = await fetch(`${config.enterpriseJavaUrl.replace(/\/$/, "")}/policy/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {})
      });

      if (!response.ok) {
        const text = await response.text();
        res.status(502).json(errorJson("enterprise_java_error", "Enterprise Java validation failed.", { upstream: text }));
        return;
      }

      const payload = await response.json();
      res.json({ ok: true, result: payload });
    } catch (error) {
      res.status(502).json(errorJson("enterprise_java_unreachable", "Enterprise Java service is unreachable.", { message: error?.message || "" }));
    }
  });

  app.post("/polyglot/exec/safe", async (req, res) => {
    try {
      const response = await fetch(`${config.runtimeCppUrl.replace(/\/$/, "")}/exec/safe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {})
      });

      if (!response.ok) {
        const text = await response.text();
        res.status(502).json(errorJson("runtime_cpp_error", "C++ runtime execution failed.", { upstream: text }));
        return;
      }

      const payload = await response.json();
      res.json({ ok: true, result: payload });
    } catch (error) {
      res.status(502).json(errorJson("runtime_cpp_unreachable", "C++ runtime service is unreachable.", { message: error?.message || "" }));
    }
  });
}
