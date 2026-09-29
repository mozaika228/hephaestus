"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type Labels = {
  email: string; password: string; signIn: string; signUp: string;
  switchToSignIn: string; switchToSignUp: string; signOut: string; loading: string;
};

export default function AuthGate({ children, labels }: { children: ReactNode; labels: Labels }) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/auth/me`, { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        setEmail(payload.user.email);
        setAuthenticated(true);
      })
      .catch(() => setError("Could not reach the Hephaestus API."))
      .finally(() => setChecking(false));
  }, [apiBase]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/auth/${isRegister ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, client: "web" }),
        credentials: "include"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Authentication failed.");
      setAuthenticated(true);
      setEmail(payload.user.email);
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally { setPending(false); }
  };

  const signOut = async () => {
    await fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    setAuthenticated(false);
  };

  if (checking) return <div className="auth-screen"><p>{labels.loading}</p></div>;
  if (!authenticated) return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="eyebrow">HEPHAESTUS ACCOUNT</div>
        <h1>{isRegister ? labels.signUp : labels.signIn}</h1>
        <label>{labels.email}<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>{labels.password}<input type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {isRegister ? <small>Password must contain at least 12 characters.</small> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="primary" disabled={pending}>{pending ? "…" : isRegister ? labels.signUp : labels.signIn}</button>
        <button type="button" className="ghost" onClick={() => { setIsRegister(!isRegister); setError(""); }}>
          {isRegister ? labels.switchToSignIn : labels.switchToSignUp}
        </button>
      </form>
    </main>
  );
  return <><div className="auth-toolbar"><span>{email}</span><button className="ghost" onClick={signOut}>{labels.signOut}</button></div>{children}</>;
}
