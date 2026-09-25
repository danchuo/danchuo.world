"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AdminApiError, deleteTierlist, listTierlists } from "@/lib/api/admin";
import type { TierlistAdminView } from "@/lib/api/types";
import { shirtStandings, SHIRTS, TIERS } from "@/lib/tierlist";
import { mono, secondaryBtnStyle } from "./adminUi";

const cell: CSSProperties = { padding: "10px 10px", verticalAlign: "top" };
const num = (x: number | null) => (x === null ? "—" : x.toFixed(1));

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Moderation of the public tier list shelf: the nick is typed by strangers, so it is TEXT only. §5.20 */
export function TierlistSection({ token }: { token: string }) {
  const [lists, setLists] = useState<TierlistAdminView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (t: string) => {
    setBusy(true);
    setError(null);
    try {
      setLists(await listTierlists(t));
    } catch (e) {
      setError(
        e instanceof AdminApiError
          ? e.status === 401
            ? "неверный/просроченный токен — войди заново"
            : `ошибка ${e.status}`
          : "сеть недоступна",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(token);
  }, [token, load]);

  async function onDelete(list: TierlistAdminView) {
    if (!window.confirm(`Снять тирлист «${list.nick ?? "аноним"}» с публикации?`)) return;
    try {
      await deleteTierlist(token, list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (e) {
      setError(e instanceof AdminApiError ? `не удалось удалить (${e.status})` : "сеть недоступна");
    }
  }

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>тирлисты</h2>
        <span style={mono}>
          {lists.length > 0 ? `опубликовано: ${lists.length}` : "пока пусто"}
          {busy && " · загрузка…"}
        </span>
      </header>

      {error && <p className="mb-4" style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      {lists.length > 0 && <Standings lists={lists.filter((l) => !l.isBot)} />}

      {lists.length > 0 && (
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
              <th style={cell}>когда · от кого</th>
              <th style={cell}>тиры</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => (
              <tr
                key={list.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  opacity: list.isBot ? 0.5 : 1,
                }}
              >
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <div>{formatStamp(list.submittedAt)}</div>
                  <div style={{ ...mono, color: "var(--text-secondary)" }}>{list.nick ?? "аноним"}</div>
                  {list.isBot && <div style={{ ...mono, color: "var(--accent)" }}>бот? (скрыт с борда)</div>}
                </td>
                <td style={{ ...cell, ...mono }}>
                  {TIERS.map((tier) => (
                    <div key={tier}>
                      {tier}: {(list.tiers[tier] ?? []).join(", ") || "—"}
                    </div>
                  ))}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <button type="button" style={secondaryBtnStyle} onClick={() => onDelete(list)}>
                    удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The overall standings: each shirt's mean place and mean tier over the lists on the shelf. §5.20 */
function Standings({ lists }: { lists: TierlistAdminView[] }) {
  const rows = shirtStandings(lists, SHIRTS);
  const images = new Map(SHIRTS.map((s) => [s.id, s.image]));
  return (
    <div className="mb-8">
      <h3 className="mb-2" style={{ fontSize: 14, color: "var(--text-primary)" }}>
        общий зачёт <span style={mono}>· по {lists.length} спискам, без ботов</span>
      </h3>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
            <th style={cell}>#</th>
            <th style={cell}>футболка</th>
            <th style={cell}>среднее место</th>
            <th style={cell}>средний тир</th>
            <th style={cell}>голосов</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <td style={{ ...cell, ...mono }}>{row.votes > 0 ? i + 1 : "—"}</td>
              <td style={{ ...cell, display: "flex", alignItems: "center", gap: 8 }}>
                <img src={images.get(row.id)} alt="" width={32} height={32} />
                {Number(row.id)}
              </td>
              <td style={{ ...cell, ...mono }}>{num(row.avgPlace)}</td>
              <td style={{ ...cell, ...mono }}>
                {row.tierLetter ? `${row.tierLetter} · ${num(row.avgTier)}` : "—"}
              </td>
              <td style={{ ...cell, ...mono }}>{row.votes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
