"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createArtifact,
  deleteArtifact,
  listArtifactsAdmin,
  scanArtifactsEverywhere,
  suggestArtifactHint,
  updateArtifact,
  uploadArtifactImage,
} from "@/lib/api/admin";
import type { AdminArtifactView, ArtifactInput } from "@/lib/api/types";
import {
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
  sortOrder: 0,
  detectionHint: null,
};

function toInput(a: AdminArtifactView): ArtifactInput {
  return {
    name: a.name,
    firstMentionedOn: a.firstMentionedOn,
    rotatable: a.rotatable,
    sortOrder: a.sortOrder,
    detectionHint: a.detectionHint,
  };
}

/**
 * Заведение артефактов (PRD §5.8). До этого каждый новый предмет был миграцией Liquibase —
 * то есть правкой кода и раскаткой.
 *
 * Два поля тут неочевидны и потому подписаны прямо в форме: «набок» — свойство самого предмета
 * (у очков есть правильная сторона, у ракетки нет), а «описание для поиска» — то, что видит
 * модель, ищущая предмет на кадрах (§5.12): каталожное имя ей бесполезно. Описание можно
 * попросить у модели по загруженной картинке — это дешёвая текстовая задача, и её намеренно
 * решает бесплатный провайдер.
 */
export function ArtifactSection({ token, onError }: ArtifactSectionProps) {
  const [items, setItems] = useState<AdminArtifactView[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ArtifactInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function onScanAll() {
    if (!confirm("искать артефакты во всех дропах? это обращение к платной модели на каждый кадр")) {
      return;
    }
    setBusy(true);
    try {
      const started = await scanArtifactsEverywhere(token);
      setNotice(`прогон запущен по ${started.length} дропам — идёт в фоне`);
    } catch (e) {
      onError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={sectionTitleStyle}>артефакты</h2>
        <span style={mono}>{items.length} шт</span>
        <button type="button" style={secondaryBtnStyle} onClick={onScanAll} disabled={busy}>
          искать во всех дропах
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <input
          style={fieldStyle}
          placeholder="название"
          aria-label="название артефакта"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={fieldStyle}
            type="date"
            aria-label="дата первого упоминания"
            value={form.firstMentionedOn}
            onChange={(e) => setForm({ ...form, firstMentionedOn: e.target.value })}
          />
          <input
            style={{ ...fieldStyle, width: 110 }}
            type="number"
            aria-label="порядок в ленте"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
          />
          <label style={{ ...mono, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={form.rotatable}
              onChange={(e) => setForm({ ...form, rotatable: e.target.checked })}
            />
            можно класть набок
          </label>
        </div>
        <textarea
          style={{ ...fieldStyle, minHeight: 56, resize: "vertical" }}
          placeholder="описание для поиска на кадрах — как предмет выглядит, по-английски"
          aria-label="описание для поиска"
          value={form.detectionHint ?? ""}
          onChange={(e) => setForm({ ...form, detectionHint: e.target.value || null })}
        />
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
              <div style={{ fontSize: 14 }}>{a.name}</div>
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
