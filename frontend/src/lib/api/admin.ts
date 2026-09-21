import type { BoxRect } from "@/lib/artifactHighlight";
import type { AdminArtifactView, AdminDropView, AdminPhotoView, AnalyticsSummaryView, ArtifactInput, ArtifactScanRunView, ArtifactScanStatusView, BikeImportResultView, FeedbackNoteView, HeatmapView, OrientationStatusView, UploadResultView } from "./types";

/** Owner API uses an explicit bearer from /admin sessionStorage. Public reads use client.ts. PRD §5.12, §9.8. */

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(`Админ-запрос вернул ${status}${errorCode ? ` (${errorCode})` : ""}`);
    this.name = "AdminApiError";
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function parseError(res: Response): Promise<never> {
  let code: string | undefined;
  try {
    code = ((await res.json()) as { error?: string }).error;
  } catch {
    // Non-JSON errors have no application code.
  }
  throw new AdminApiError(res.status, code);
}

/** Upload a ZIP with a title and ISO date; elapsed time reflects server processing better than upload progress. */
export async function uploadDrop(
  token: string,
  zip: File,
  title: string,
  date: string,
): Promise<UploadResultView> {
  const form = new FormData();
  form.append("zip", zip);
  form.append("title", title);
  form.append("date", date);
  const res = await fetch(`${BASE}/api/ingest/drops`, {
    method: "POST",
    headers: authHeaders(token), // FormData sets Content-Type itself (the boundary)
    body: form,
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as UploadResultView;
}

/** List drops; 401 also identifies an invalid token. */
export async function listDropsAdmin(token: string): Promise<AdminDropView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminDropView[];
}

/** Get drop photo IDs and thumbnails for cover selection. */
export async function getDropPhotosAdmin(token: string, dropId: number): Promise<AdminPhotoView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/photos`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** Set the drop cover photo. */
export async function setCover(token: string, dropId: number, photoId: number): Promise<AdminDropView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/cover`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ photoId }),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminDropView;
}

/** Start an idempotent orientation check; poll {@link getOrientationStatus} for progress. */
export async function startOrientationCheck(token: string, dropId: number): Promise<OrientationStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/orientation`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as OrientationStatusView;
}

/** Get drop orientation-check status. */
export async function getOrientationStatus(token: string, dropId: number): Promise<OrientationStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/orientation`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as OrientationStatusView;
}

/** Rotate a photo 90 degrees clockwise; return photos with versioned thumbnail URLs. */
export async function rotatePhoto(token: string, dropId: number, photoId: number): Promise<AdminPhotoView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/photos/${photoId}/rotate`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ rotation: "cw90" }),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** Permanently delete a photo; return the updated list with its cover reassigned if needed. */
export async function deletePhoto(token: string, dropId: number, photoId: number): Promise<AdminPhotoView[]> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/photos/${photoId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** Delete a drop and its photo files. */
export async function deleteDrop(token: string, dropId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
}

/** Import raw browser-collected ride content, idempotently by rental ID. PRD §5.13, §13. */
export async function importBikeRides(token: string, rides: unknown[]): Promise<BikeImportResultView> {
  const res = await fetch(`${BASE}/api/ingest/bike/rides`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(rides),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as BikeImportResultView;
}

/** Import TARIFF purchases, idempotently by payment ID; rental cost excludes tariff access. PRD §5.13. */
export async function importBikeTariffs(token: string, purchases: unknown[]): Promise<BikeImportResultView> {
  const res = await fetch(`${BASE}/api/ingest/bike/tariffs`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(purchases),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as BikeImportResultView;
}

/** The private visit dashboard for ISO MSK dates; omitted bounds use the server default. */
export async function getAnalyticsSummary(
  token: string,
  from?: string,
  to?: string,
): Promise<AnalyticsSummaryView> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const res = await fetch(`${BASE}/api/ingest/analytics/summary?${qs.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AnalyticsSummaryView;
}

/** Get the private tile heatmap for ISO MSK dates; omitted bounds use the server default. */
export async function getHeatmap(
  token: string,
  path = "/",
  from?: string,
  to?: string,
): Promise<HeatmapView> {
  const qs = new URLSearchParams({ path });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const res = await fetch(`${BASE}/api/ingest/analytics/heatmap?${qs.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as HeatmapView;
}

// Artifacts: PRD §5.8.

export async function listArtifactsAdmin(token: string): Promise<AdminArtifactView[]> {
  const res = await fetch(`${BASE}/api/ingest/artifacts`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView[];
}

export async function createArtifact(
  token: string,
  input: ArtifactInput,
): Promise<AdminArtifactView> {
  const res = await fetch(`${BASE}/api/ingest/artifacts`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

export async function updateArtifact(
  token: string,
  id: number,
  input: ArtifactInput,
): Promise<AdminArtifactView> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

export async function deleteArtifact(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
}

export async function uploadArtifactImage(
  token: string,
  id: number,
  image: File,
): Promise<AdminArtifactView> {
  const form = new FormData();
  form.append("image", image);
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}/image`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

/** `.glb` only — the backend checks the file's own header and refuses anything else. */
export async function uploadArtifactModel(
  token: string,
  id: number,
  model: File,
): Promise<AdminArtifactView> {
  const form = new FormData();
  form.append("model", model);
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}/model`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

export async function deleteArtifactModel(token: string, id: number): Promise<AdminArtifactView> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}/model`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminArtifactView;
}

/** Ask the model for an artifact hint; null is normal when unconfigured or unanswered, so manual input remains available. */
export async function suggestArtifactHint(token: string, id: number): Promise<string | null> {
  const res = await fetch(`${BASE}/api/ingest/artifacts/${id}/hint`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return ((await res.json()) as { hint: string | null }).hint;
}

/** Scan the archive; artifactId limits updates to one artifact, but each photo still costs one model call. */
export async function scanArtifactsEverywhere(
  token: string,
  artifactId?: number,
): Promise<ArtifactScanRunView> {
  const query = artifactId === undefined ? "" : `?artifactId=${artifactId}`;
  const res = await fetch(`${BASE}/api/ingest/artifact-scan${query}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanRunView;
}

/** Poll archive scan status while state is running. */
export async function getArtifactScanRun(token: string): Promise<ArtifactScanRunView> {
  const res = await fetch(`${BASE}/api/ingest/artifact-scan`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanRunView;
}

/** Cancel an archive scan; 409 means no active scan. */
export async function cancelArtifactScan(token: string): Promise<ArtifactScanRunView> {
  const res = await fetch(`${BASE}/api/ingest/artifact-scan`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanRunView;
}

/** Start an artifact scan for one drop. PRD §5.12. */
export async function startArtifactScan(
  token: string,
  dropId: number,
): Promise<ArtifactScanStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/artifacts`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanStatusView;
}

export async function getArtifactScanStatus(
  token: string,
  dropId: number,
): Promise<ArtifactScanStatusView> {
  const res = await fetch(`${BASE}/api/ingest/drops/${dropId}/artifacts`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ArtifactScanStatusView;
}

/** Upsert by photo + artifact; pass a normalized 0..1 box with x1 > x0. Returns updated photos. PRD §5.12. */
export async function saveArtifactBox(
  token: string,
  dropId: number,
  photoId: number,
  artifactId: number,
  box: BoxRect,
): Promise<AdminPhotoView[]> {
  const res = await fetch(
    `${BASE}/api/ingest/drops/${dropId}/photos/${photoId}/artifacts/${artifactId}`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(box),
    },
  );
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** Remove an artifact box and return updated photos. */
export async function deleteArtifactBox(
  token: string,
  dropId: number,
  photoId: number,
  artifactId: number,
): Promise<AdminPhotoView[]> {
  const res = await fetch(
    `${BASE}/api/ingest/drops/${dropId}/photos/${photoId}/artifacts/${artifactId}`,
    { method: "DELETE", headers: authHeaders(token) },
  );
  if (!res.ok) return parseError(res);
  return (await res.json()) as AdminPhotoView[];
}

/** The visitor notes inbox, newest first. PRD §5.19. */
export async function listFeedback(token: string): Promise<FeedbackNoteView[]> {
  const res = await fetch(`${BASE}/api/ingest/feedback`, { headers: authHeaders(token) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as FeedbackNoteView[];
}

/** Delete one note; 404 means it was already gone. */
export async function deleteFeedback(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/ingest/feedback/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
}
