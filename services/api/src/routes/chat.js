import { getProvider } from "../providers/index.js";
import { getConfig } from "../config.js";
import { formatStreamError, formatStreamDone } from "../providers/stream.js";

export function registerChatRoutes(app) {
  app.post("/chat", async (req, res) => {
    const { message, provider, fileId } = req.body || {};
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const config = { ...getConfig(), provider: provider || getConfig().provider };
    const providerFn = getProvider(config);

    try {
      await providerFn({ message: message || "", res, config, stream: true, fileId });
    } catch (error) {
      res.write(formatStreamError("Chat stream error."));
      res.end(formatStreamDone());
    }
  });

  app.post("/chat/single", async (req, res) => {
    const { message, provider, fileId } = req.body || {};
    const config = { ...getConfig(), provider: provider || getConfig().provider };
    const providerFn = getProvider(config);

    try {
      const result = await providerFn({ message: message || "", res, config, stream: false, fileId });
      if (result?.ok === false) {
        res.status(400).json(result);
        return;
      }
      res.json({ ok: true, text: result?.text || "" });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Chat request failed." });
    }
  });
}
