"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AdminApiError, getAnalyticsSummary } from "@/lib/api/admin";
import {
  formatCount,
  formatDuration,
  formatVital,
  periodWindow,
  PERIODS,
  vitalGrade,
  type VitalGrade,
  type VitalKey,
} from "@/lib/analyticsFormat";
import { mskToday } from "@/lib/date";
import type { AnalyticsSummaryView } from "@/lib/api/types";
import { activeTabBtnStyle, mono, tabBtnStyle } from "./adminUi";
import { BreakdownRows, hintedStyle } from "./BreakdownRows";
import { DailyChart } from "./DailyChart";
import { HeatmapSection } from "./HeatmapSection";

/** The owner's private dashboard: KPI, the daily series, every dimension, then the heatmap. */
export function StatsSection({ token }: { token: string }) {
  const [days, setDays] = useState<number>(PERIODS[0].days);
  const [data, setData] = useState<AnalyticsSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The period is resolved once and shared: the heatmap below must answer for the same window,
  // or the two halves of one screen describe different periods.
  const window = useMemo(() => periodWindow(days, mskToday()), [days]);

  const load = useCallback(async (t: string, from: string, to: string) => {
    setBusy(true);
    setError(null);
    try {
      setData(await getAnalyticsSummary(t, from, to));
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
    load(token, window.from, window.to);
  }, [token, window, load]);

  const totals = data?.totals;
  const breakdowns = data?.breakdowns ?? {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontSize: 16, color: "var(--text-primary)" }}>статистика посещений</h2>
        <nav role="tablist" aria-label="период" className="flex flex-wrap items-center gap-1">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              role="tab"
              aria-selected={days === period.days}
              onClick={() => setDays(period.days)}
              style={days === period.days ? activeTabBtnStyle : tabBtnStyle}
            >
              {period.label}
            </button>
          ))}
          <span style={{ ...mono, marginLeft: 8 }}>
            {window.from} → {window.to}
            {busy && " · загрузка…"}
          </span>
        </nav>
      </header>

      {error && <p style={{ ...mono, color: "var(--accent)" }}>{error}</p>}

      <dl style={kpiRowStyle}>
        <Kpi label="визиты" value={formatCount(totals?.visits ?? 0)} />
        <Kpi label="уники" value={formatCount(totals?.uniques ?? 0)} />
        <Kpi label="ср. время" value={formatDuration(totals?.avgDwellMs ?? null)} />
        <Kpi
          label="вовлечённость"
          value={`${totals?.engagementPct ?? 0}%`}
          hint={`Доля визитов, где посетитель пробыл на странице не меньше 10 секунд активного времени (свёрнутая вкладка не считается) ИЛИ кликнул хотя бы раз. Заменяет «отказы»: на сайте из одной страницы отказ всегда 100% и не измеряет ничего. Сейчас таких визитов ${formatCount(totals?.engagedVisits ?? 0)}.`}
        />
        <Kpi label="клики" value={formatCount(totals?.clicks ?? 0)} />
        <Kpi
          label="глубина скролла"
          value={totals?.avgScrollPct == null ? "—" : `${totals.avgScrollPct}%`}
        />
      </dl>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ ...mono, color: "var(--text-tertiary)" }}>
          <span title={VITALS_HINT} style={hintedStyle}>
            скорость у посетителей · p75
          </span>
        </h3>
        <dl style={kpiRowStyle}>
          {VITALS.map(({ key, label }) => {
            const vital = data?.vitals?.[key];
            const p75 = vital?.p75 ?? null;
            return (
              <Kpi
                key={key}
                label={`${label} · ${formatCount(vital?.samples ?? 0)}`}
                value={formatVital(key, p75)}
                color={GRADE_COLOR[vitalGrade(key, p75) ?? "none"]}
              />
            );
          })}
        </dl>
      </section>

      <DailyChart days={data?.days ?? []} />

      <div style={gridStyle}>
        <BreakdownRows
          title="источники"
          dimension="source"
          rows={breakdowns.source ?? []}
          hint="Сайт, со страницы которого кликнули ссылку сюда: браузер сам присылает его в заголовке Referer, мы храним только хост. «Прямые заходы» — набрали адрес руками, открыли из закладок или пришли оттуда, где реферер не передают (мессенджеры, почтовые клиенты)."
        />
        <BreakdownRows title="устройства" dimension="device" rows={breakdowns.device ?? []} />
        <BreakdownRows
          title="utm-источники"
          dimension="utmSource"
          rows={breakdowns.utmSource ?? []}
          hint="Значение ?utm_source= в адресе — метка, которую ты сам дописываешь в публикуемую ссылку: danchuo.world/?utm_source=telegram. В отличие от реферера её видно даже там, откуда реферер не приходит."
        />
        <BreakdownRows
          title="utm-кампании"
          dimension="utmCampaign"
          rows={breakdowns.utmCampaign ?? []}
          hint="Значение ?utm_campaign= — метка конкретного запуска, чтобы отличить один пост или рассылку от другой при одном и том же источнике."
        />
        <BreakdownRows
          title="волны"
          dimension="wave"
          rows={breakdowns.wave ?? []}
          hint="Какая волна была на экране в момент захода. «Не собиралось» — визиты до того, как этот разрез появился: задним числом волну не восстановить, она менялась между релизами. У новых заходов поле есть всегда."
        />
        <BreakdownRows title="ширина окна" dimension="viewport" rows={breakdowns.viewport ?? []} />
      </div>

      <HeatmapSection token={token} from={window.from} to={window.to} />
    </div>
  );
}

/** One KPI. The number wears the primary ink; only the bar charts carry the accent. */
function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div style={kpiStyle}>
      <dt style={{ ...mono, color: "var(--text-tertiary)" }}>
        {hint ? (
          <span title={hint} style={hintedStyle}>
            {label}
          </span>
        ) : (
          label
        )}
      </dt>
      <dd style={{ fontSize: 24, fontWeight: 600, color: color ?? "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
        {value}
      </dd>
    </div>
  );
}

const VITALS: { key: VitalKey; label: string }[] = [
  { key: "lcpMs", label: "LCP" },
  { key: "inpMs", label: "INP" },
  { key: "cls", label: "CLS" },
  { key: "fcpMs", label: "FCP" },
  { key: "ttfbMs", label: "TTFB" },
];

/** Waves without status tokens fall back to plain ink rather than to a hardcoded colour. */
const GRADE_COLOR: Record<VitalGrade | "none", string | undefined> = {
  good: "var(--success, var(--text-primary))",
  "needs-improvement": "var(--accent)",
  poor: "var(--danger, var(--accent))",
  none: undefined,
};

const VITALS_HINT =
  "Web Vitals, измеренные в браузерах настоящих посетителей (боты не считаются). Число — 75-й перцентиль: у трёх из четырёх визитов было не хуже. Рядом с названием — сколько визитов прислали метрику. LCP — когда отрисовался главный контент (хорошо ≤ 2.5 с); INP — задержка отклика на клик (≤ 200 мс); CLS — сдвиги вёрстки (≤ 0.1); FCP — первый отрисованный контент (≤ 1.8 с); TTFB — ответ сервера (≤ 0.8 с). Зелёный — хорошо, акцент — терпимо, красный — плохо.";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
};

const kpiStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
  padding: "10px 12px",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 8,
};
