"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  cancelArtifactScan,
  createArtifact,
  deleteArtifact,
  getArtifactScanRun,
  listArtifactsAdmin,
  scanArtifactsEverywhere,
  suggestArtifactHint,
  updateArtifact,
  uploadArtifactImage,
} from "@/lib/api/admin";
import type { AdminArtifactView, ArtifactInput, ArtifactScanRunView } from "@/lib/api/types";
import {
  artifactRunLabel,
  btnStyle,
  describe,
  fieldStyle,
  mono,
  secondaryBtnStyle,
  sectionTitleStyle,
  todayIso,
} from "./adminUi";

interface ArtifactSectionProps {
  token: string;
  onError: (message: string) => void;
}

const EMPTY: ArtifactInput = {
  name: "",
  firstMentionedOn: todayIso(),
  rotatable: false,
  detectionHint: null,
};

function toInput(a: AdminArtifactView): ArtifactInput {
  return {
    name: a.name,
    firstMentionedOn: a.firstMentionedOn,
    rotatable: a.rotatable,
    detectionHint: a.detectionHint,
  };
}

/** Artifact management and image-derived detection hints. PRD §5.8, §5.12. */
export function ArtifactSection({ token, onError }: ArtifactSectionProps) {
  const [items, setItems] = useState<AdminArtifactView[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ArtifactInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [run, setRun] = useState<ArtifactScanRunView | null>(null);

  /** Use the current list image so edits cannot leave the form preview stale. */
  const editingImage = items.find((a) => a.id === editingId)?.imageUrl ?? null;
  const scanning = run?.state === "running";
  const runLabel = run ? artifactRunLabel(run) : "";

  const load = useCallback(async () => {
    try {
      setItems(await listArtifactsAdmin(token));
    } catch (e) {
      onError(describe(e));
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Archive scans survive reloads; restore their status on entry, then poll while active.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const fresh = await getArtifactScanRun(token);
        if (alive) setRun(fresh);
      } catch {
        // Optional scan status must not obscure the form with an error.
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  function startEdit(a: AdminArtifactView) {
    setEditingId(a.id);
    setForm(toInput(a));
    setNotice(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      if (editingId === null) {
        const created = await createArtifact(token, form);
        setNotice(`заведён «${created.name}» — загрузи картинку`);
        setEditingId(created.id);
      } else {
        await updateArtifact(token, editingId, form);
        setNotice("сохранено");
      }
      await load();
    } catch (e) {
      onError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImage(id: number, file: File) {
    setBusy(true);
    try {
      await uploadArtifactImage(token, id, file);
      await load();
      setNotice("картинка загружена");
    } catch (e) {
      onError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSuggest(id: number) {
    setBusy(true);
    setNotice(null);
    try {
      const hint = await suggestArtifactHint(token, id);
      if (hint) {
        setEditingId(id);
        setForm((f) => ({ ...f, detectionHint: hint }));
        setNotice("описание предложено — проверь и сохрани");
      } else {
        setNotice("модель промолчала — впиши описание руками");
      }
    } catch (e) {
      onError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(a: AdminArtifactView) {
    if (!confirm(`удалить «${a.name}»?`)) return;
    setBusy(true);
    try {
      await deleteArtifact(token, a.id);
      if (editingId === a.id) resetForm();
      await load();
    } catch (e) {
      onError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  /** A targeted scan preserves other items' detections; billing remains per photo. PRD §5.12. */
  async function onScan(only?: AdminArtifactView) {
    const what = only ? `«${only.name}»` : "все артефакты";
    if (!confirm(`искать ${what} во всех дропах? это обращение к платной модели на каждый кадр`)) {
      return;
    }
    setBusy(true);
    try {
      setRun(await scanArtifactsEverywhere(token, only?.id));
      setNotice(null);
    } catch (e) {
      onError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCancelScan() {
    try {
      setRun(await cancelArtifactScan(token));
    } catch (e) {
      onError(describe(e));
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={sectionTitleStyle}>артефакты</h2>
        <span style={mono}>{items.length} шт</span>
        <button type="button" style={secondaryBtnStyle} onClick={() => void onScan()} disabled={busy || scanning}>
          искать все во всех дропах
        </button>
      </div>

      {/* The run summary: without it a scan over the archive was opaque — the only trace was a
          line saying it had started, and stopping it took a backend restart. */}
      {run && runLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={mono}>{runLabel}</span>
          {scanning && (
            <button type="button" style={secondaryBtnStyle} onClick={() => void onCancelScan()}>
              остановить
            </button>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 560 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={mono}>название</span>
          <input
            style={fieldStyle}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            {/* It also sets the place in the ribbon: the order is chronology, with no separate field. */}
            <span style={mono}>первое упоминание — им же лента и сортируется</span>
            <input
              style={fieldStyle}
              type="date"
              value={form.firstMentionedOn}
              onChange={(e) => setForm({ ...form, firstMentionedOn: e.target.value })}
            />
          </label>
          <label
            style={{ ...mono, display: "flex", alignItems: "center", gap: 6, paddingBottom: 10 }}
          >
            <input
              type="checkbox"
              checked={form.rotatable}
              onChange={(e) => setForm({ ...form, rotatable: e.target.checked })}
            />
            можно класть набок
          </label>
        </div>

        {/* A picture can only be attached to an existing record — there is no id before saving,
            so a new item gets a hint here rather than a dead button. */}
        <div style={{ display: "grid", gap: 4 }}>
          <span style={mono}>картинка</span>
          {editingId === null ? (
            <span style={mono}>появится сразу после «завести»</span>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {editingImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editingImage}
                  alt=""
                  width={48}
                  height={48}
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <span style={{ ...mono, width: 48, textAlign: "center" }}>—</span>
              )}
              <label style={{ ...secondaryBtnStyle, cursor: "pointer" }}>
                {editingImage ? "заменить" : "загрузить"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Reset to allow selecting the same file again to trigger onChange.
                    e.target.value = "";
                    if (f) void onImage(editingId, f);
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={mono}>описание для поиска на кадрах — как предмет выглядит, по-английски</span>
          <textarea
            style={{ ...fieldStyle, minHeight: 56, resize: "vertical" }}
            placeholder="a white and pink badminton racket"
            value={form.detectionHint ?? ""}
            onChange={(e) => setForm({ ...form, detectionHint: e.target.value || null })}
          />
        </label>
        {editingId !== null && (
          <button
            type="button"
            style={{ ...secondaryBtnStyle, justifySelf: "start" }}
            onClick={() => void onSuggest(editingId)}
            disabled={busy || !editingImage}
            title={editingImage ? "описать картинку моделью" : "сначала загрузи картинку"}
          >
            предложить описание
          </button>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" style={btnStyle} disabled={busy || !form.name.trim()}>
            {editingId === null ? "завести" : "сохранить"}
          </button>
          {editingId !== null && (
            <button type="button" style={secondaryBtnStyle} onClick={resetForm} disabled={busy}>
              новый
            </button>
          )}
        </div>
      </form>

      {notice && <p style={mono}>{notice}</p>}

      <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((a) => (
          <li
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 8,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: editingId === a.id ? "var(--bg-surface-muted)" : "transparent",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.imageUrl ? (
              <img src={a.imageUrl} alt="" width={40} height={40} style={{ objectFit: "contain" }} />
            ) : (
              <span style={{ ...mono, width: 40, textAlign: "center" }}>—</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* The date is visible in the row because it sets the order of the list and the
                  ribbon — otherwise sorting would go by an invisible field. */}
              <div style={{ fontSize: 14 }}>
                {a.name} <span style={mono}>{a.firstMentionedOn}</span>
              </div>
              <div style={{ ...mono, overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.detectionHint ?? "без описания для поиска"}
              </div>
            </div>
            <label style={{ ...secondaryBtnStyle, cursor: "pointer" }}>
              картинка
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onImage(a.id, f);
                }}
              />
            </label>
            <button
              type="button"
              style={secondaryBtnStyle}
              onClick={() => void onSuggest(a.id)}
              disabled={busy || !a.imageUrl}
              title={a.imageUrl ? "описать картинку моделью" : "сначала загрузи картинку"}
            >
              предложить
            </button>
            {/* A scan per item: the usual path is "added an artifact, now looking for it". The
                separate button is not about cost (one call per frame either way) but about
                leaving the other items' findings as they are. */}
            <button
              type="button"
              style={secondaryBtnStyle}
              onClick={() => void onScan(a)}
              disabled={busy || scanning}
              title={
                a.detectionHint
                  ? "искать этот предмет во всех дропах"
                  : "без описания для поиска модель будет искать по названию"
              }
            >
              искать
            </button>
            <button type="button" style={secondaryBtnStyle} onClick={() => startEdit(a)}>
              править
            </button>
            <button type="button" style={secondaryBtnStyle} onClick={() => void onDelete(a)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
