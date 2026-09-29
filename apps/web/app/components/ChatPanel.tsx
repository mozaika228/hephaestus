"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getApiBase } from "../apiClient";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama" }
];

type ChatMessage = { id?: string; role: "user" | "assistant"; text: string };
type Conversation = { id: string; title: string; provider: string; updatedAt: string };
type ChatPanelLabels = {
  title: string; subtitle: string; placeholder: string; send: string; uploading: string;
  upload: string; analyze: string; fileLabel: string; readyMessage: string;
  connectionError: string; errorPrefix: string; analysisTitle: string; noData: string;
  conversations: string; newConversation: string;
};

function parseSse(buffer: string) {
  const events: Array<{ type?: string; text?: string; message?: string; conversationId?: string }> = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try { events.push(JSON.parse(line.slice(5).trim())); } catch { /* Ignore incomplete events. */ }
    }
  }
  return { events, rest };
}

export default function ChatPanel({ labels }: { labels: ChatPanelLabels }) {
  const apiBase = useMemo(() => getApiBase(), []);
  const [provider, setProvider] = useState("openai");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ id?: string; name?: string; providerFileId?: string } | null>(null);
  const [analysis, setAnalysis] = useState<{ text?: string; error?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    const response = await apiFetch(`${apiBase}/conversations`);
    const payload = await response.json();
    if (payload.ok) setConversations(payload.conversations || []);
  }, [apiBase]);

  const openConversation = useCallback(async (id: string) => {
    const response = await apiFetch(`${apiBase}/conversations/${id}`);
    const payload = await response.json();
    if (!payload.ok) return;
    setConversationId(id);
    setProvider(payload.conversation.provider);
    setMessages((payload.messages || []).filter((item: { role: string }) => item.role !== "system")
      .map((item: { id: string; role: "user" | "assistant"; content: string }) => ({ id: item.id, role: item.role, text: item.content })));
    setFileInfo(payload.files?.length ? payload.files[payload.files.length - 1] : null);
    setAnalysis(null);
  }, [apiBase]);

  useEffect(() => {
    refreshConversations().catch(() => undefined);
  }, [refreshConversations]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const newConversation = async () => {
    if (pending) return;
    setConversationId(null);
    setMessages([]);
    setFileInfo(null);
    setAnalysis(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || pending) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }, { role: "assistant", text: "" }]);
    setPending(true);
    let assistantText = "";
    try {
      const response = await apiFetch(`${apiBase}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, provider, conversationId: conversationId || undefined, fileId: fileInfo?.providerFileId, attachmentId: fileInfo?.id })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error?.message || `Chat request failed (${response.status})`);
      }
      if (!response.body) throw new Error("The API returned an empty response stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSse(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.type === "conversation" && event.conversationId) setConversationId(event.conversationId);
          if (event.type === "delta") {
            assistantText += event.text || "";
            setMessages((prev) => prev.map((item, index) => index === prev.length - 1 ? { ...item, text: assistantText } : item));
          }
          if (event.type === "error") {
            assistantText = `${labels.errorPrefix}: ${event.message || labels.connectionError}`;
            setMessages((prev) => prev.map((item, index) => index === prev.length - 1 ? { ...item, text: assistantText } : item));
          }
        }
      }
      await refreshConversations();
    } catch (cause) {
      const errorText = cause instanceof Error ? cause.message : labels.connectionError;
      setMessages((prev) => prev.map((item, index) => index === prev.length - 1 ? { ...item, text: errorText } : item));
    } finally {
      setPending(false);
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    let activeId = conversationId;
    if (!activeId) {
      const created = await apiFetch(`${apiBase}/conversations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider })
      }).then((response) => response.json());
      if (!created.ok) return;
      activeId = created.conversation.id;
      setConversationId(activeId);
      await refreshConversations();
    }
    if (!activeId) return;
    const form = new FormData();
    form.append("file", file);
    form.append("conversationId", activeId);
    const response = await apiFetch(`${apiBase}/files/ingest`, { method: "POST", body: form });
    const payload = await response.json();
    if (payload.ok) { setFileInfo(payload.file); setAnalysis(null); }
  };

  const analyzeFile = async () => {
    if (!fileInfo?.id) return;
    const payload = await apiFetch(`${apiBase}/files/${fileInfo.id}/analyze`, { method: "POST" }).then((response) => response.json());
    if (payload.ok) setAnalysis(payload.analysis);
  };

  return (
    <section className="console">
      <div className="console-header">
        <div><h3>{labels.title}</h3><p>{labels.subtitle}</p></div>
        <select value={provider} onChange={(event) => setProvider(event.target.value)}>
          {PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div className="conversation-layout">
        <aside className="conversation-sidebar">
          <button className="primary" onClick={newConversation}>{labels.newConversation}</button>
          <h4>{labels.conversations}</h4>
          {conversations.map((item) => (
            <button key={item.id} className={`conversation-link ${conversationId === item.id ? "active" : ""}`} onClick={() => openConversation(item.id)}>
              {item.title || labels.newConversation}
            </button>
          ))}
        </aside>
        <div className="console-body">
          <div className="chat" ref={scrollRef}>
            {!messages.length ? <div className="bubble assistant">{labels.readyMessage}</div> : null}
            {messages.map((msg, idx) => <div key={msg.id || idx} className={`bubble ${msg.role}`}>{msg.text}</div>)}
          </div>
          <div className="inputs">
            <input placeholder={labels.placeholder} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" ? sendMessage() : null} />
            <button className="primary" onClick={sendMessage} disabled={pending}>{pending ? labels.uploading : labels.send}</button>
          </div>
          <div className="files">
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <button className="ghost" onClick={uploadFile}>{labels.upload}</button>
            <button className="ghost" onClick={analyzeFile}>{labels.analyze}</button>
            {fileInfo ? <span className="file-tag">{labels.fileLabel}: {fileInfo.name}</span> : null}
          </div>
          {analysis ? <div className="analysis"><h4>{labels.analysisTitle}</h4><pre>{analysis.text || analysis.error || labels.noData}</pre></div> : null}
        </div>
      </div>
    </section>
  );
}
