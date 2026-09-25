"use client";

import { useCallback, useEffect, useState } from "react";
import { WaveSwitcher } from "@/components/WaveSwitcher";
import { AdminLogin } from "./AdminLogin";
import { AdminTabs } from "./AdminTabs";
import { ArtifactMarker } from "./ArtifactMarker";
import { ArtifactSection } from "./ArtifactSection";
import { BikeImportSection } from "./BikeImportSection";
import { DropList } from "./DropList";
import { DropUploadForm } from "./DropUploadForm";
import { FeedbackSection } from "./FeedbackSection";
import { StatsSection } from "./StatsSection";
import { TierlistSection } from "./TierlistSection";
import { PhotoGrid } from "./PhotoGrid";
import { TOKEN_KEY, describe, mono } from "./adminUi";
import type { AdminTabId } from "./adminUi";
import {
  deleteDrop,
  deletePhoto,
  getDropPhotosAdmin,
  deleteArtifactBox,
  getArtifactScanStatus,
  getOrientationStatus,
  listArtifactsAdmin,
  listDropsAdmin,
  startArtifactScan,
  rotatePhoto,
  setCover,
  startOrientationCheck,
} from "@/lib/api/admin";
import type {
  AdminArtifactView,
  AdminDropView,
  AdminPhotoView,
  ArtifactScanStatusView,
  OrientationStatusView,
} from "@/lib/api/types";

/** Shared admin state and background polling survive section changes; forms own their local state. PRD §5.14. */
export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<AdminTabId>("drops");
  const [drops, setDrops] = useState<AdminDropView[]>([]);
  const [selected, setSelected] = useState<AdminDropView | null>(null);
  const [photos, setPhotos] = useState<AdminPhotoView[]>([]);
  const [orientation, setOrientation] = useState<OrientationStatusView | null>(null);
  const [artifactScan, setArtifactScan] = useState<ArtifactScanStatusView | null>(null);
  // Keep the annotation catalog outside the marker to reuse it across photos.
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [catalogue, setCatalogue] = useState<AdminArtifactView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDrops = useCallback(async (t: string) => {
    setError(null);
    const list = await listDropsAdmin(t);
    setDrops(list);
    setAuthed(true);
  }, []);

  // Try the saved session token on mount.
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    setToken(saved);
    loadDrops(saved).catch((e) => setError(describe(e)));
  }, [loadDrops]);

  /** Persist the token only after a successful list request; AdminLogin displays rejection. */
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
      setMarkingId(null); // the marker belongs to a frame of the drop we left
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

  // Refresh photos after orientation completes; versioned URLs invalidate their image caches.
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

  // Artifact and orientation scans run independently; poll only the active job.
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

  /** Explicit action only: scanning charges a model call per photo. */
  async function onScanArtifacts() {
    if (!selected) return;
    setError(null);
    try {
      setArtifactScan(await startArtifactScan(token, selected.id));
    } catch (err) {
      setError(describe(err));
    }
  }

  /** Fetch the catalog on opening the marker so items added in another section are available. */
  async function onMarkPhoto(photoId: number) {
    setError(null);
    setMarkingId(photoId);
    try {
      setCatalogue(await listArtifactsAdmin(token));
    } catch (err) {
      setError(describe(err));
    }
  }

  /** Manual rejection overrides model detections. */
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

  /** Rotate clockwise 90 degrees and receive photos with refreshed versioned URLs. */
  async function onRotate(photoId: number) {
    if (!selected) return;
    setError(null);
    try {
      setPhotos(await rotatePhoto(token, selected.id, photoId));
    } catch (err) {
      setError(describe(err));
    }
  }

  /** Deletion is irreversible: confirm, then refresh photos. */
  async function onDeletePhoto(photoId: number) {
    if (!selected) return;
    if (!confirm("Удалить этот кадр? Вернуть нельзя — если что, перезалей дроп из zip.")) return;
    setError(null);
    try {
      setPhotos(await deletePhoto(token, selected.id, photoId));
      await loadDrops(token); // the frame count and cover in the drop list
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

  /** Reload the list and open the newly uploaded drop. */
  const onUploaded = useCallback(
    async (drop: AdminDropView) => {
      await loadDrops(token);
      await selectDrop(drop);
    },
    [loadDrops, selectDrop, token],
  );

  if (!authed) return <AdminLogin onLogin={onLogin} />;

  const marking = markingId === null ? null : (photos.find((p) => p.id === markingId) ?? null);

  return (
    <main className="safe-area-pad mx-auto min-h-screen max-w-5xl p-6 [--safe-pad:1.5rem]">
      {/* One header for everything: sections on the left, utilities on the right. There is
          deliberately no page title — the row of sections IS the header, so the top of the screen
          carries one line instead of two. */}
      <header
        className="mb-6 flex flex-wrap items-center justify-between gap-4 pb-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Switching section clears the error: it belongs to the screen we left and would read as
            the new one's own breakage. */}
        <AdminTabs
          active={tab}
          onSelect={(next) => {
            setError(null);
            setTab(next);
          }}
        />

        <div className="flex items-center gap-4">
          {/* The same wave switcher tile as the board's. It needs an explicit HEIGHT, not just a
              width: here it is a header item, and a wave whose chip fills the plate collapsed to
              zero-height buttons. 160×62 is measured — the smallest box keeping a 44px tap target. */}
          <WaveSwitcher className="admin-wave-switcher" style={{ width: 160, height: 62 }} />
          <button type="button" onClick={logout} style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
            выйти
          </button>
        </div>
      </header>

      {/* The error sits above the section: every section sets it, and it must be visible on any. */}
      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      {tab === "drops" && (
        <>
          <DropUploadForm
            token={token}
            onUploaded={onUploaded}
            onError={setError}
            activeDropId={selected?.id ?? null}
            artifactScan={artifactScan}
            onScanArtifacts={onScanArtifacts}
          />
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
              onMarkPhoto={onMarkPhoto}
            />
          </div>
          {/* The marker takes its frame from the shared list rather than a copy: a saved box comes
              back with fresh frames and appears both there and in the chips at once. Delete the
              frame and the marker closes itself. */}
          {marking && selected && (
            <ArtifactMarker
              token={token}
              dropId={selected.id}
              photo={marking}
              artifacts={catalogue}
              onSaved={setPhotos}
              onError={setError}
              onClose={() => setMarkingId(null)}
            />
          )}
        </>
      )}

      {tab === "artifacts" && <ArtifactSection token={token} onError={setError} />}

      {tab === "rides" && <BikeImportSection token={token} onError={setError} />}

      {tab === "stats" && <StatsSection token={token} />}

      {tab === "feedback" && <FeedbackSection token={token} />}

      {tab === "tierlists" && <TierlistSection token={token} />}
    </main>
  );
}
