"use client";

import { useState, type FormEvent } from "react";
import { btnStyle, describe, fieldStyle, mono } from "./adminUi";

interface AdminLoginProps {
  /** Проверка токена: успех — родитель уже загрузил дропы и запомнил токен; бросок — показываем ошибку. */
  onLogin: (token: string) => Promise<void>;
}

/**
 * Экран входа в админку — сознательно голый: одно поле токена и одна кнопка по центру
 * экрана, без заголовка и подписи (aria-label на поле остаётся). Поле держит себя само:
 * наружу токен уходит только при успешной проверке.
 */
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
    <main className="flex min-h-screen items-center justify-center p-6">
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
