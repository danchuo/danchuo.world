"use client";

import { useState, type FormEvent } from "react";
import { btnStyle, describe, fieldStyle, mono } from "./adminUi";

interface AdminLoginProps {
  /** The parent stores the token after validation; rejection is displayed by the form. */
  onLogin: (token: string) => Promise<void>;
}

/** Minimal token form with an accessible input label. PRD §5.14. */
export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(token);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="safe-area-pad flex min-h-screen items-center justify-center p-6 [--safe-pad:1.5rem]">
      <form onSubmit={onSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          id="admin-token"
          type="password"
          aria-label="токен записи (Authorization Bearer)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={fieldStyle}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !token} style={btnStyle}>
          {busy ? "проверка…" : "сыграть"}
        </button>
        {error && <p style={{ ...mono, color: "var(--accent)" }}>{error}</p>}
      </form>
    </main>
  );
}
