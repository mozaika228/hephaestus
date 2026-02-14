"use client";

import { useMemo, useRef, useState } from "react";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "azure", label: "Azure OpenAI" },
  { id: "local", label: "Local" },
  { id: "custom", label: "Custom" }
];

function parseSse(buffer: string) {
  const events: Array<{ type?: string; text?: string; message?: string }> = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        // ignore parse errors
      }
    }
  }
  return { events, rest };
}

type ChatPanelLabels = {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  uploading: string;
  upload: string;
  analyze: string;
  fileLabel: string;
  readyMessage: string;
  connectionError: string;
  errorPrefix: string;
  analysisTitle: string;
  noData: string;
};

export default function ChatPanel({ labels }: { labels: ChatPanelLabels }) {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
    []
  );
  const [provider, setProvider] = useState("openai");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: labels.readyMessage }
  ]);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ id?: string; name?: string; providerFileId?: string } | null>(null);
  const [analysis, setAnalysis] = useState<{ text?: string; error?: string } | null>(null);
  const streamBufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushAssistantBuffer = () => {
    const delta = streamBufferRef.current;
    if (!delta) return;
    streamBufferRef.current = "";
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        last.text += delta;
      }
      return next;
    });
  };

  const scheduleFlush = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushAssistantBuffer();
    }, 60);
  };

  const sendMessage = async () => {
    if (!input.trim() || pending) return;

    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }, { role: "assistant", text: "" }]);
    setPending(true);

    try {
      const response = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, provider, fileId: fileInfo?.providerFileId })
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSse(buffer);
        buffer = rest;
        for (const event of events) {
          if (event.type === "delta") {
            streamBufferRef.current += event.text || "";
            scheduleFlush();
          }
          if (event.type === "error") {
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current);
              flushTimerRef.current = null;
            }
            flushAssistantBuffer();
            setMessages((prev) => [...prev, { role: "assistant", text: `${labels.errorPrefix}: ${event.message}` }]);
          }
        }
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushAssistantBuffer();
    } catch (error) {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushAssistantBuffer();
      setMessages((prev) => [...prev, { role: "assistant", text: labels.connectionError }]);
    } finally {
      setPending(false);
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${apiBase}/files/ingest`, {
      method: "POST",
      body: form
    });

    const payload = await response.json();
    if (payload.ok) {
      setFileInfo(payload.file);
      setAnalysis(null);
    }
  };

  const analyzeFile = async () => {
    if (!fileInfo?.id) return;
    const response = await fetch(`${apiBase}/files/${fileInfo.id}/analyze`, {
      method: "POST"
    });
    const payload = await response.json();
    if (payload.ok) {
      setAnalysis(payload.analysis);
    }
  };

  return (
    <section className="console">
      <div className="console-header">
        <div>
          <h3>{labels.title}</h3>
          <p>{labels.subtitle}</p>
        </div>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="console-body">
        <div className="chat">
          {messages.map((msg, idx) => (
            <div key={idx} className={`bubble ${msg.role}`}>
              {msg.text}
            </div>
          ))}
        </div>
        <div className="inputs">
          <input
            placeholder={labels.placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? sendMessage() : null)}
          />
          <button className="primary" onClick={sendMessage} disabled={pending}>
            {pending ? labels.uploading : labels.send}
          </button>
        </div>
        <div className="files">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="ghost" onClick={uploadFile}>
            {labels.upload}
          </button>
          <button className="ghost" onClick={analyzeFile}>
            {labels.analyze}
          </button>
          {fileInfo ? (
            <span className="file-tag">{labels.fileLabel}: {fileInfo.name}</span>
          ) : null}
        </div>
        {analysis ? (
          <div className="analysis">
            <h4>{labels.analysisTitle}</h4>
            <pre>{analysis.text || analysis.error || labels.noData}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
