"use client";

import { useState, type FormEvent } from "react";
import { importBikeRides, importBikeTariffs } from "@/lib/api/admin";
import { BIKE_BOOKMARKLET, BIKE_CONSOLE_SNIPPET } from "@/lib/bikeBookmarklet";
import { btnStyle, describe, fieldStyle, mono, secondaryBtnStyle, sectionTitleStyle } from "./adminUi";

interface BikeImportSectionProps {
  token: string;
  /** Send errors to the shared admin error row. */
  onError: (message: string) => void;
}

/** Qrator blocks the server poller; import JSON copied by the authenticated PWA bookmarklet. PRD §5.13. */
export function BikeImportSection({ token, onError }: BikeImportSectionProps) {
  const [bikeJson, setBikeJson] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Import rides and tariffs separately; legacy arrays and content pages contain rides only. */
  async function onImport(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const parsed: unknown = JSON.parse(bikeJson);
      const obj = parsed as { rides?: unknown; tariffs?: unknown; content?: unknown };
      let rides: unknown;
      let tariffs: unknown[] = [];
      if (parsed && !Array.isArray(parsed) && Array.isArray(obj.rides)) {
        rides = obj.rides; // the bookmarklet's new shape {rides, tariffs}
        if (Array.isArray(obj.tariffs)) tariffs = obj.tariffs;
      } else if (parsed && !Array.isArray(parsed) && Array.isArray(obj.content)) {
        rides = obj.content; // a whole rents/client page was pasted
      } else {
        rides = parsed; // a bare array of rides
      }
      if (!Array.isArray(rides)) throw new SyntaxError("ожидался массив поездок");

      const ridesResult = await importBikeRides(token, rides);
      let text = `поездки: +${ridesResult.created} новых, обновлено ${ridesResult.updated}`;
      if (tariffs.length > 0) {
        const tariffsResult = await importBikeTariffs(token, tariffs);
        text += `; тарифы: +${tariffsResult.created} новых, обновлено ${tariffsResult.updated}`;
      }
      setNotice(text);
      setBikeJson("");
    } catch (err) {
      onError(err instanceof SyntaxError ? `не JSON: ${err.message}` : describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(BIKE_BOOKMARKLET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("буфер обмена недоступен — скопируй сниппет вручную");
    }
  }

  return (
    <section className="admin-panel mb-8 p-4">
      <h2 className="mb-3" style={sectionTitleStyle}>поездки велобайк</h2>
      <ol className="mb-3 flex flex-col gap-1" style={{ ...mono, paddingLeft: 18, listStyle: "decimal" }}>
        <li>один раз: создай закладку в браузере телефона, вставь букмарклет в её адрес (кнопка ниже).</li>
        <li>открой <a href="https://pwa.velobike.ru" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>pwa.velobike.ru</a>, залогинься, запусти закладку — она за один заход соберёт поездки (с адресами) и покупки тарифов, покажет «собрано X из Y» и скопирует всё в буфер.</li>
        <li>вернись сюда, вставь в поле и нажми «импортировать».</li>
      </ol>
      <p className="mb-3" style={mono}>если вставилось куце (ошибка «не JSON») — в консоли на pwa.velobike.ru набери <code>copy(__vbRides)</code> и Enter, это скопирует всё без обрезки; затем вставь снова.</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copyBookmarklet} style={secondaryBtnStyle}>
          {copied ? "скопировано ✓" : "скопировать букмарклет"}
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
      <form onSubmit={onImport} className="flex flex-col gap-3">
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
          {!busy && notice && <span style={{ ...mono, color: "var(--text-secondary)" }}>{notice}</span>}
        </div>
      </form>
    </section>
  );
}
