"use client";

import { useState, type FormEvent } from "react";
import { uploadDrop } from "@/lib/api/admin";
import type { AdminDropView } from "@/lib/api/types";
import { btnStyle, describe, fieldStyle, mono, secondaryBtnStyle, sectionTitleStyle, todayIso } from "./adminUi";

interface DropUploadFormProps {
  token: string;
  /** Дроп загружен: родитель перечитывает список и открывает свежий дроп. */
  onUploaded: (drop: AdminDropView) => Promise<void>;
  /** Ошибка уходит наверх — строка ошибки в админке одна на весь экран. */
  onError: (message: string) => void;
}

/**
 * Форма нового фото-дропа: название + дата + zip (≈36 кадров). Состояние формы целиком
 * своё — снаружи нужен только токен и колбэк «загрузилось».
 */
export function DropUploadForm({ token, onUploaded, onError }: DropUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso); // ленивый инициализатор: todayIso() не гоняем на каждый рендер
  const [elapsed, setElapsed] = useState(0); // секунды с начала загрузки (честный таймер вместо прогресса)
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    setNotice(null);
    const start = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    try {
      const result = await uploadDrop(token, file, title.trim(), date);
      setNotice(`загружено: ${result.processed} кадров${result.skipped ? `, пропущено ${result.skipped}` : ""} за ${Math.floor((Date.now() - start) / 1000)}s`);
      setFile(null);
      setTitle("");
      await onUploaded(result.drop);
    } catch (err) {
      onError(describe(err));
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel mb-8 p-4">
      <h2 className="mb-3" style={sectionTitleStyle}>новый дроп</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
          <label style={{ ...secondaryBtnStyle, display: "inline-block" }}>
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
  );
}
