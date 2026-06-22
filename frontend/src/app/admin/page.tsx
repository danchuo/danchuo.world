"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  AdminApiError,
  deleteDrop,
  getDropPhotosAdmin,
  listDropsAdmin,
  setCover,
  uploadDrop,
} from "@/lib/api/admin";
import { mediaUrl } from "@/lib/api/media";
import type { AdminDropView, AdminPhotoView } from "@/lib/api/types";

const TOKEN_KEY = "danchuo_admin_token";

const mono = { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" } satisfies CSSProperties;
const fieldStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  padding: "8px 10px",
  fontSize: 14,
};
const btnStyle: CSSProperties = {
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "var(--bg-base)",
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};

/** Сегодняшняя дата в формате input[type=date] (`yyyy-MM-dd`), локальная. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Админка фото-дропов (B1, PRD §5.12, §9 п.8). Под тем же bearer-токеном, что ingest: вводишь
 * токен (хранится в sessionStorage), грузишь zip (≈36 кадров) с названием и датой, затем кликом
 * помечаешь «самый показательный» кадр обложкой. Прочие правки (удаление) — тут же. Не SSR/SEO.
 */
export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [drops, setDrops] = useState<AdminDropView[]>([]);
  const [selected, setSelected] = useState<AdminDropView | null>(null);
  const [photos, setPhotos] = useState<AdminPhotoView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Форма загрузки.
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso());
  const [elapsed, setElapsed] = useState(0); // секунды с начала загрузки (честный таймер вместо прогресса)

  const describe = (e: unknown): string =>
    e instanceof AdminApiError
      ? e.status === 401
        ? "неверный токен"
        : `ошибка ${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}`
      : "сеть недоступна";

  const loadDrops = useCallback(async (t: string) => {
    setError(null);
    const list = await listDropsAdmin(t);
    setDrops(list);
    setAuthed(true);
  }, []);

  // Подхватываем сохранённый токен и сразу пробуем войти.
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    setToken(saved);
    loadDrops(saved).catch((e) => setError(describe(e)));
  }, [loadDrops]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await loadDrops(token);
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch (err) {
      setError(describe(err));
      setAuthed(false);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAuthed(false);
    setDrops([]);
    setSelected(null);
    setPhotos([]);
  }

  const selectDrop = useCallback(
    async (drop: AdminDropView) => {
      setSelected(drop);
      setPhotos([]);
      try {
        setPhotos(await getDropPhotosAdmin(token, drop.id));
      } catch (err) {
        setError(describe(err));
      }
    },
    [token],
  );

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const start = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    try {
      const result = await uploadDrop(token, file, title.trim(), date);
      setNotice(`загружено: ${result.processed} кадров${result.skipped ? `, пропущено ${result.skipped}` : ""} за ${Math.floor((Date.now() - start) / 1000)}s`);
      setFile(null);
      setTitle("");
      await loadDrops(token);
      await selectDrop(result.drop);
    } catch (err) {
      setError(describe(err));
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  async function onSetCover(photoId: number) {
    if (!selected) return;
    try {
      const updated = await setCover(token, selected.id, photoId);
      setSelected(updated);
      setDrops((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setPhotos((prev) => prev.map((p) => ({ ...p, isCover: p.id === photoId })));
    } catch (err) {
      setError(describe(err));
    }
  }

  async function onDelete(drop: AdminDropView) {
    if (!confirm(`Удалить дроп «${drop.title}» и все его кадры?`)) return;
    try {
      await deleteDrop(token, drop.id);
      if (selected?.id === drop.id) {
        setSelected(null);
        setPhotos([]);
      }
      await loadDrops(token);
    } catch (err) {
      setError(describe(err));
    }
  }

  if (!authed) {
    return (
      <main className="mx-auto min-h-screen max-w-md p-6">
        <h1 className="mb-4" style={{ fontSize: 22, color: "var(--text-primary)" }}>admin</h1>
        <form onSubmit={onLogin} className="flex flex-col gap-3">
          <label style={mono}>токен записи (Authorization Bearer)</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={fieldStyle}
            autoComplete="off"
            placeholder="DANCHUO_INGEST_TOKEN"
          />
          <button type="submit" disabled={busy || !token} style={btnStyle}>
            {busy ? "проверка…" : "войти"}
          </button>
          {error && <p style={{ ...mono, color: "var(--accent)" }}>{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 style={{ fontSize: 22, color: "var(--text-primary)" }}>admin · фото-дропы</h1>
        <nav className="flex items-baseline gap-4">
          <Link href="/admin/heatmap" style={{ ...mono, color: "var(--accent)" }}>хитмапа →</Link>
          <button type="button" onClick={logout} style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
            выйти
          </button>
        </nav>
      </header>

      {/* Загрузка нового дропа. */}
      <section className="mb-8 pixel-tile p-4">
        <h2 className="mb-3" style={{ fontSize: 16, color: "var(--text-primary)" }}>новый дроп</h2>
        <form onSubmit={onUpload} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="название"
              style={{ ...fieldStyle, flex: "2 1 220px" }}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...fieldStyle, flex: "1 1 160px" }}
            />
          </div>
          {/* Кнопка-лейбл открывает системный файл-пикер (нативно, без JS). Сам input скрыт. */}
          <div className="flex flex-wrap items-center gap-3">
            <label
              style={{ ...btnStyle, background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", display: "inline-block" }}
            >
              {file ? "выбрать другой zip" : "выбрать zip…"}
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                style={{ display: "none" }}
              />
            </label>
            <span style={{ ...mono, color: file ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
              {file ? file.name : "файл не выбран"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !file || !title.trim()} style={btnStyle}>
              {busy ? "загрузка…" : "загрузить"}
            </button>
            {!busy && notice && <span style={{ ...mono, color: "var(--text-secondary)" }}>{notice}</span>}
          </div>

          {/* Честный таймер: реальное время = аплоад + форвард + ресайз ~36 кадров на сервере.
              Долю аплоада не показываем — она вводит в заблуждение (локально «отправка» мгновенна). */}
          {busy && (
            <span aria-live="polite" style={{ ...mono, color: "var(--text-secondary)" }}>
              загрузка и обработка на сервере… {elapsed}s (не закрывай вкладку)
            </span>
          )}
          <p style={mono}>zip с кадрами (JPEG/PNG, ≈36 шт). Большой архив грузится минутами. HEIC и не-картинки пропускаются.</p>
        </form>
      </section>

      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Список дропов. */}
        <section className="md:w-1/3">
          <h2 className="mb-3" style={{ fontSize: 16, color: "var(--text-primary)" }}>дропы</h2>
          {drops.length === 0 ? (
            <p style={mono}>пока нет дропов</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {drops.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => selectDrop(d)}
                    className="flex-1 text-left"
                    style={{
                      background: selected?.id === d.id ? "var(--bg-surface-muted)" : "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "6px 8px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{d.title}</span>
                    <span style={{ ...mono, marginLeft: 8 }}>{d.droppedOn} · {d.photoCount}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(d)}
                    aria-label={`Удалить ${d.title}`}
                    style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Сетка кадров выбранного дропа — клик помечает обложкой. */}
        <section className="md:flex-1">
          <h2 className="mb-3" style={{ fontSize: 16, color: "var(--text-primary)" }}>
            {selected ? `обложка дропа «${selected.title}»` : "выбери дроп"}
          </h2>
          {selected && photos.length === 0 && <p style={mono}>в дропе нет кадров</p>}
          {selected && photos.length > 0 && (
            <>
              <p className="mb-3" style={mono}>кликни кадр, чтобы сделать его обложкой (она показывается в архиве)</p>
              <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
                {photos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSetCover(p.id)}
                      aria-label={p.isCover ? "Текущая обложка" : "Сделать обложкой"}
                      aria-pressed={p.isCover}
                      style={{
                        display: "block",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        padding: 0,
                        cursor: "pointer",
                        background: "none",
                        borderRadius: "var(--radius-sm)",
                        overflow: "hidden",
                        outline: p.isCover ? "3px solid var(--accent)" : "1px solid var(--border)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(p.thumbUrl)} alt="" className="h-full w-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
