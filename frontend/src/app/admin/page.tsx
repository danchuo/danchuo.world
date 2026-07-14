"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { WaveSwitcher } from "@/components/WaveSwitcher";
import { Icon } from "@/components/Icon";
import { HeatmapSection } from "./HeatmapSection";
import {
  AdminApiError,
  deleteDrop,
  deletePhoto,
  getDropPhotosAdmin,
  getOrientationStatus,
  importBikeRides,
  listDropsAdmin,
  rotatePhoto,
  setCover,
  startOrientationCheck,
  uploadDrop,
} from "@/lib/api/admin";
import { BIKE_BOOKMARKLET, BIKE_CONSOLE_SNIPPET } from "@/lib/bikeBookmarklet";
import { mediaUrl } from "@/lib/api/media";
import type { AdminDropView, AdminPhotoView, OrientationStatusView } from "@/lib/api/types";

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
/* Cover-pick thumbnail button; the isCover outline stays inline. */
const coverBtnStyle: CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "1 / 1",
  padding: 0,
  cursor: "pointer",
  background: "none",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
};
/* Manual-rotate button pinned to the frame corner (B9). */
const rotateBtnStyle: CSSProperties = {
  position: "absolute",
  right: 4,
  bottom: 4,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};
/* Per-frame delete button pinned to the top-right corner (opposite the rotate ↻ at bottom-right). */
const deletePhotoBtnStyle: CSSProperties = {
  position: "absolute",
  right: 4,
  top: 4,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};
/* "?" badge on frames the LLM could not orient (B9). */
const ambiguousBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 4,
  top: 4,
  padding: "1px 6px",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "var(--bg-base)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

/** Сегодняшняя дата в формате input[type=date] (`yyyy-MM-dd`), локальная. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Человекочитаемая ошибка админ-API. Чистая (без состояния) — на уровне модуля, не пересоздаётся. */
function describe(e: unknown): string {
  return e instanceof AdminApiError
    ? e.status === 401
      ? "неверный токен"
      : `ошибка ${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}`
    : "сеть недоступна";
}

/** Строка статуса проверки поворота под заголовком сетки кадров. Чистая — на уровне модуля. */
function orientationLabel(s: OrientationStatusView): string {
  switch (s.state) {
    case "running":
      return `проверка… ${s.checked + s.skipped}/${s.total}, повёрнуто ${s.rotated}`;
    case "done":
      return `проверено ${s.checked}/${s.total}, повёрнуто ${s.rotated}${s.skipped ? `, пропущено ${s.skipped}` : ""}`;
    case "failed":
      return "проверка упала — смотри логи бэка";
    default:
      return s.total > 0 ? `проверено кадров: ${s.checked}/${s.total}` : "";
  }
}

/**
 * Админка (B1+B2, PRD §5.11–5.12, §9 п.8) — один скроллящийся экран под общим bearer-токеном
 * ingest: сверху фото-дропы (zip ≈36 кадров с названием/датой, клик по кадру — обложка,
 * удаление), ниже — секция хитмапы кликов [HeatmapSection]. Токен хранится в sessionStorage.
 * Дизайн следует волнам (токены из корневого layout, свитчер в шапке). Не SSR/SEO.
 */
export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [drops, setDrops] = useState<AdminDropView[]>([]);
  const [selected, setSelected] = useState<AdminDropView | null>(null);
  const [photos, setPhotos] = useState<AdminPhotoView[]>([]);
  const [orientation, setOrientation] = useState<OrientationStatusView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Форма загрузки.
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso); // ленивый инициализатор: todayIso() не гоняем на каждый рендер
  const [elapsed, setElapsed] = useState(0); // секунды с начала загрузки (честный таймер вместо прогресса)

  // Импорт поездок Велобайка (B4): JSON из букмарклета → ingest.
  const [bikeJson, setBikeJson] = useState("");
  const [bikeNotice, setBikeNotice] = useState<string | null>(null);
  const [bikeCopied, setBikeCopied] = useState(false);

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
      setOrientation(null);
      try {
        setPhotos(await getDropPhotosAdmin(token, drop.id));
        setOrientation(await getOrientationStatus(token, drop.id));
      } catch (err) {
        setError(describe(err));
      }
    },
    [token],
  );

  // Поллинг статуса LLM-проверки поворота (B9), пока прогон бежит; по завершении — свежие
  // кадры (у повёрнутых новые ?v=-URL, кэш не мешает).
  useEffect(() => {
    if (!selected || orientation?.state !== "running") return;
    const dropId = selected.id;
    const timer = window.setInterval(async () => {
      try {
        const next = await getOrientationStatus(token, dropId);
        setOrientation(next);
        if (next.state !== "running") {
          setPhotos(await getDropPhotosAdmin(token, dropId));
        }
      } catch (err) {
        setError(describe(err));
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [token, selected, orientation?.state]);

  async function onCheckOrientation() {
    if (!selected) return;
    setError(null);
    try {
      setOrientation(await startOrientationCheck(token, selected.id));
    } catch (err) {
      setError(describe(err));
    }
  }

  /** Ручной поворот кадра на 90° по часовой; ответ — свежий список кадров (новые ?v=-URL). */
  async function onRotate(photoId: number) {
    if (!selected) return;
    setError(null);
    try {
      setPhotos(await rotatePhoto(token, selected.id, photoId));
    } catch (err) {
      setError(describe(err));
    }
  }

  /** Удалить один кадр (неудачный). Возврата нет — предупреждаем; в ответ свежий список кадров. */
  async function onDeletePhoto(photoId: number) {
    if (!selected) return;
    if (!confirm("Удалить этот кадр? Вернуть нельзя — если что, перезалей дроп из zip.")) return;
    setError(null);
    try {
      setPhotos(await deletePhoto(token, selected.id, photoId));
      await loadDrops(token); // счётчик кадров/обложка в списке дропов
    } catch (err) {
      setError(describe(err));
    }
  }

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

  /** Импорт вставленного JSON поездок. Прощаем и голый массив, и целую страницу `{content:[…]}`. */
  async function onImportBike(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setBikeNotice(null);
    try {
      let parsed: unknown = JSON.parse(bikeJson);
      if (parsed && !Array.isArray(parsed) && Array.isArray((parsed as { content?: unknown }).content)) {
        parsed = (parsed as { content: unknown[] }).content;
      }
      if (!Array.isArray(parsed)) throw new SyntaxError("ожидался массив поездок");
      const result = await importBikeRides(token, parsed);
      setBikeNotice(`импортировано: +${result.created} новых, обновлено ${result.updated}`);
      setBikeJson("");
    } catch (err) {
      setError(err instanceof SyntaxError ? `не JSON: ${err.message}` : describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(BIKE_BOOKMARKLET);
      setBikeCopied(true);
      window.setTimeout(() => setBikeCopied(false), 2000);
    } catch {
      setError("буфер обмена недоступен — скопируй сниппет вручную");
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
    // Deliberately bare login: just the token field and a single button, dead-centered.
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form onSubmit={onLogin} className="flex w-full max-w-xs flex-col gap-3">
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

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      {/* No page heading by design — the wave switcher and logout are the whole header. */}
      <header className="mb-6 flex flex-wrap items-center justify-end gap-4">
        {/* Same wave switcher tile as the board — the admin follows waves too. */}
        <WaveSwitcher style={{ width: 190 }} />
        <button type="button" onClick={logout} style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
          выйти
        </button>
      </header>

      {/* Загрузка нового дропа. */}
      <section className="admin-panel mb-8 p-4">
        <h2 className="mb-3" style={{ fontSize: 16, color: "var(--text-primary)" }}>новый дроп</h2>
        <form onSubmit={onUpload} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              aria-label="название дропа"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="название"
              style={{ ...fieldStyle, flex: "2 1 220px" }}
            />
            <input
              type="date"
              aria-label="дата дропа"
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
                    style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: "var(--accent)", display: "inline-flex" }}
                  >
                    <Icon name="close" size={15} />
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
          {selected && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {/* Запуск/статус LLM-проверки поворота кадров (B9). */}
              <button
                type="button"
                onClick={onCheckOrientation}
                disabled={orientation?.state === "running"}
                style={{ ...btnStyle, background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                {orientation?.state === "running" ? "проверяю поворот…" : "проверить поворот"}
              </button>
              {orientation && <span aria-live="polite" style={mono}>{orientationLabel(orientation)}</span>}
            </div>
          )}
          {selected && photos.length === 0 && <p style={mono}>в дропе нет кадров</p>}
          {selected && photos.length > 0 && (
            <>
              <p className="mb-3" style={mono}>кликни кадр, чтобы сделать его обложкой (она показывается в архиве); ↻ поворачивает кадр на 90°, ✕ удаляет кадр без возврата</p>
              <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
                {photos.map((p) => (
                  <li key={p.id} style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => onSetCover(p.id)}
                      aria-label={p.isCover ? "Текущая обложка" : "Сделать обложкой"}
                      aria-pressed={p.isCover}
                      style={{
                        ...coverBtnStyle,
                        outline: p.isCover ? "3px solid var(--accent)" : "1px solid var(--border)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(p.thumbUrl)} alt="" className="h-full w-full object-cover" />
                    </button>
                    {/* Ручная стрелка поворота — поверх угла кадра, отдельная от клика-обложки
                        (stopPropagation не нужен: это соседний элемент, а не вложенный). */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotate(p.id);
                      }}
                      disabled={orientation?.state === "running"}
                      aria-label="Повернуть кадр на 90° по часовой"
                      title="повернуть на 90°"
                      style={rotateBtnStyle}
                    >
                      <Icon name="rotate" size={15} />
                    </button>
                    {/* Удаление одного кадра — верхний-правый угол (напротив ↻), отдельно от клика-обложки. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePhoto(p.id);
                      }}
                      disabled={orientation?.state === "running"}
                      aria-label="Удалить кадр"
                      title="удалить кадр"
                      style={deletePhotoBtnStyle}
                    >
                      <Icon name="close" size={15} />
                    </button>
                    {/* LLM не определилась с верхом — кадр ждёт ручной стрелки. */}
                    {p.orientation === "ambiguous" && (
                      <span
                        title="LLM не определилась с верхом — проверь кадр"
                        style={{ ...ambiguousBadgeStyle, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <Icon name="help" size={12} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Импорт поездок Велобайка (B4) — серверный поллер за Qrator, поэтому доставка идёт
          букмарклетом из залогиненной PWA: он копирует JSON, его вставляют сюда. */}
      <hr className="my-8" style={{ border: "none", borderTop: "1px solid var(--border)" }} />
      <section className="admin-panel mb-8 p-4">
        <h2 className="mb-3" style={{ fontSize: 16, color: "var(--text-primary)" }}>поездки велобайк</h2>
        <ol className="mb-3 flex flex-col gap-1" style={{ ...mono, paddingLeft: 18, listStyle: "decimal" }}>
          <li>один раз: создай закладку в браузере телефона, вставь букмарклет в её адрес (кнопка ниже).</li>
          <li>открой <a href="https://pwa.velobike.ru" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>pwa.velobike.ru</a>, залогинься, запусти закладку — она покажет «собрано X из Y» и скопирует поездки в буфер.</li>
          <li>вернись сюда, вставь в поле и нажми «импортировать».</li>
        </ol>
        <p className="mb-3" style={mono}>если вставилось куце (ошибка «не JSON») — в консоли на pwa.velobike.ru набери <code>copy(__vbRides)</code> и Enter, это скопирует всё без обрезки; затем вставь снова.</p>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyBookmarklet}
            style={{ ...btnStyle, background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {bikeCopied ? "скопировано ✓" : "скопировать букмарклет"}
          </button>
          <span style={mono}>если CSP душит закладку — вставь сниппет в консоль DevTools на pwa.velobike.ru:</span>
        </div>
        <textarea
          readOnly
          aria-label="сниппет для консоли"
          value={BIKE_CONSOLE_SNIPPET}
          onFocus={(ev) => ev.currentTarget.select()}
          rows={2}
          className="mb-4 w-full"
          style={{ ...fieldStyle, ...mono, resize: "vertical", whiteSpace: "pre", overflowX: "auto" }}
        />
        <form onSubmit={onImportBike} className="flex flex-col gap-3">
          <textarea
            aria-label="JSON поездок велобайк"
            value={bikeJson}
            onChange={(ev) => setBikeJson(ev.target.value)}
            placeholder="вставь сюда JSON, скопированный букмарклетом"
            rows={4}
            className="w-full"
            style={{ ...fieldStyle, resize: "vertical" }}
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !bikeJson.trim()} style={btnStyle}>
              {busy ? "импорт…" : "импортировать"}
            </button>
            {!busy && bikeNotice && <span style={{ ...mono, color: "var(--text-secondary)" }}>{bikeNotice}</span>}
          </div>
        </form>
      </section>

      {/* Хитмапа кликов — ниже дропов, на одном скроллящемся экране (B2). */}
      <hr className="my-8" style={{ border: "none", borderTop: "1px solid var(--border)" }} />
      <HeatmapSection token={token} />
    </main>
  );
}
