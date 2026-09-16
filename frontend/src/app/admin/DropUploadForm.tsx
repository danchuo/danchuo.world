"use client";

import { useState, type FormEvent } from "react";
import { uploadDrop } from "@/lib/api/admin";
import type { AdminDropView, ArtifactScanStatusView } from "@/lib/api/types";
import {
  artifactScanLabel,
  btnStyle,
  describe,
  fieldStyle,
  mono,
  secondaryBtnStyle,
  sectionTitleStyle,
  todayIso,
} from "./adminUi";

interface DropUploadFormProps {
  token: string;
  /** The parent reloads the list and opens the uploaded drop. */
  onUploaded: (drop: AdminDropView) => Promise<void>;
  /** Send errors to the shared admin error row. */
  onError: (message: string) => void;
  /** Show the scan invitation only while the newly uploaded drop remains selected. */
  activeDropId: number | null;
  /** Current drop's scan progress for the button label. */
  artifactScan: ArtifactScanStatusView | null;
  /** Scan every catalog item in the uploaded drop. */
  onScanArtifacts: () => void;
}

/** Orientation runs automatically; paid artifact scanning requires an explicit post-upload action. PRD §5.12. */
export function DropUploadForm({
  token,
  onUploaded,
  onError,
  activeDropId,
  artifactScan,
  onScanArtifacts,
}: DropUploadFormProps) {
  const [uploaded, setUploaded] = useState<AdminDropView | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso); // lazy initialiser: todayIso() is not run per render
  const [elapsed, setElapsed] = useState(0); // seconds since upload began (an honest timer, not a progress bar)
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scanning = artifactScan?.state === "running";

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
      setUploaded(result.drop);
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
        {/* The label button opens the system file picker natively; the input itself is hidden. */}
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

        {/* An honest timer: the real time is upload plus forward plus resizing on the server. An
            upload percentage would mislead — locally "sending" is instant. */}
        {busy && (
          <span aria-live="polite" style={{ ...mono, color: "var(--text-secondary)" }}>
            загрузка и обработка на сервере… {elapsed}s (не закрывай вкладку)
          </span>
        )}
        <p style={mono}>zip с кадрами (JPEG/PNG, ≈36 шт). Большой архив грузится минутами. HEIC и не-картинки пропускаются.</p>
      </form>

      {/* This block lives only while the freshly uploaded drop is the open one: the admin has a
          single scan status and it belongs to the SELECTED drop. */}
      {uploaded && uploaded.id === activeDropId && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 pt-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span style={{ ...mono, color: "var(--text-secondary)" }}>
            «{uploaded.title}» · поворот кадров проверяется сам · артефакты: не проверялись
          </span>
          <button
            type="button"
            onClick={onScanArtifacts}
            disabled={scanning}
            style={secondaryBtnStyle}
            title="весь каталог предметов разом: вызов к платной модели на каждый кадр"
          >
            {scanning ? "ищу артефакты…" : "искать все предметы в этом дропе"}
          </button>
          {artifactScan && (
            <span aria-live="polite" style={mono}>{artifactScanLabel(artifactScan)}</span>
          )}
        </div>
      )}
    </section>
  );
}
