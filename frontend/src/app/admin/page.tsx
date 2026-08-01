"use client";

import { useCallback, useEffect, useState } from "react";
import { WaveSwitcher } from "@/components/WaveSwitcher";
import { AdminLogin } from "./AdminLogin";
import { ArtifactSection } from "./ArtifactSection";
import { BikeImportSection } from "./BikeImportSection";
import { DropList } from "./DropList";
import { DropUploadForm } from "./DropUploadForm";
import { HeatmapSection } from "./HeatmapSection";
import { PhotoGrid } from "./PhotoGrid";
import { TOKEN_KEY, describe, mono } from "./adminUi";
import {
  deleteDrop,
  deletePhoto,
  getDropPhotosAdmin,
  deleteArtifactBox,
  getArtifactScanStatus,
  getOrientationStatus,
  listDropsAdmin,
  startArtifactScan,
  rotatePhoto,
  setCover,
  startOrientationCheck,
} from "@/lib/api/admin";
import type {
  AdminDropView,
  AdminPhotoView,
  ArtifactScanStatusView,
  OrientationStatusView,
} from "@/lib/api/types";

/**
 * Админка (B1+B2, PRD §5.11–5.12, §9 п.8) — один скроллящийся экран под общим bearer-токеном
 * ingest: сверху фото-дропы (zip ≈36 кадров с названием/датой, клик по кадру — обложка,
 * удаление), ниже — артефакты [ArtifactSection], импорт поездок Велобайка и секция хитмапы
 * кликов [HeatmapSection].
 * Токен хранится в sessionStorage. Дизайн следует волнам (токены из корневого layout,
 * свитчер в шапке). Не SSR/SEO.
 *
 * Страница держит только то, что секции **делят между собой**: токен, список дропов с
 * выбранным, его кадры и статус проверки поворота (их меняют сразу несколько действий), плюс
 * одну строку ошибки на весь экран. Состояние форм живёт внутри своих секций.
 */
export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [drops, setDrops] = useState<AdminDropView[]>([]);
  const [selected, setSelected] = useState<AdminDropView | null>(null);
  const [photos, setPhotos] = useState<AdminPhotoView[]>([]);
  const [orientation, setOrientation] = useState<OrientationStatusView | null>(null);
  const [artifactScan, setArtifactScan] = useState<ArtifactScanStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  /** Вход: токен запоминаем только после успешной загрузки списка (бросок покажет [AdminLogin]). */
  const onLogin = useCallback(
    async (t: string) => {
      await loadDrops(t);
      sessionStorage.setItem(TOKEN_KEY, t);
      setToken(t);
    },
    [loadDrops],
  );

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
      setArtifactScan(null);
      try {
        setPhotos(await getDropPhotosAdmin(token, drop.id));
        setOrientation(await getOrientationStatus(token, drop.id));
        setArtifactScan(await getArtifactScanStatus(token, drop.id));
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

  // Поллинг поиска артефактов, пока прогон бежит. Отдельный от поворота: прогоны независимы,
  // и объединять их значило бы дёргать оба эндпоинта, когда бежит только один.
  useEffect(() => {
    if (!selected || artifactScan?.state !== "running") return;
    const dropId = selected.id;
    const timer = window.setInterval(async () => {
      try {
        setArtifactScan(await getArtifactScanStatus(token, dropId));
      } catch (err) {
        setError(describe(err));
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [token, selected, artifactScan?.state]);

  /** Поиск артефактов по кадрам дропа — только по кнопке: платная модель на каждый кадр. */
  async function onScanArtifacts() {
    if (!selected) return;
    setError(null);
    try {
      setArtifactScan(await startArtifactScan(token, selected.id));
    } catch (err) {
      setError(describe(err));
    }
  }

  /** Снять с кадра рамку одного предмета: ручное решение главнее находки модели. */
  async function onDeleteArtifact(photoId: number, artifactId: number) {
    if (!selected) return;
    setError(null);
    try {
      setPhotos(await deleteArtifactBox(token, selected.id, photoId, artifactId));
    } catch (err) {
      setError(describe(err));
    }
  }

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

  /** Свежезалитый дроп: перечитываем список и сразу открываем его кадры. */
  const onUploaded = useCallback(
    async (drop: AdminDropView) => {
      await loadDrops(token);
      await selectDrop(drop);
    },
    [loadDrops, selectDrop, token],
  );

  if (!authed) return <AdminLogin onLogin={onLogin} />;

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

      <DropUploadForm token={token} onUploaded={onUploaded} onError={setError} />

      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      <div className="flex flex-col gap-6 md:flex-row">
        <DropList drops={drops} selectedId={selected?.id ?? null} onSelect={selectDrop} onDelete={onDelete} />
        <PhotoGrid
          selected={selected}
          photos={photos}
          orientation={orientation}
          onCheckOrientation={onCheckOrientation}
          artifactScan={artifactScan}
          onScanArtifacts={onScanArtifacts}
          onSetCover={onSetCover}
          onRotate={onRotate}
          onDeletePhoto={onDeletePhoto}
          onDeleteArtifact={onDeleteArtifact}
        />
      </div>

      {/* Артефакты (§5.8): раньше новый предмет означал миграцию, теперь — форма. */}
      <hr className="my-8" style={{ border: "none", borderTop: "1px solid var(--border)" }} />
      <ArtifactSection token={token} onError={setError} />

      <hr className="my-8" style={{ border: "none", borderTop: "1px solid var(--border)" }} />
      <BikeImportSection token={token} onError={setError} />

      {/* Хитмапа кликов — ниже дропов, на одном скроллящемся экране (B2). */}
      <hr className="my-8" style={{ border: "none", borderTop: "1px solid var(--border)" }} />
      <HeatmapSection token={token} />
    </main>
  );
}
