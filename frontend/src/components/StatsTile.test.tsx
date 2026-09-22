import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DaySummary } from "@/lib/api/types";
import { StatsTile } from "./StatsTile";

/**
 * The GitHub contributions chip in the stats tile (§7.4, registry I-01): "+N" beside steps and
 * sleep. Staying silent on zero is not cosmetics — the owner has many zero days in a row, and a
 * daily grey "+0" would become noise. The chip answers exactly "was there any git?".
 */
const day = (over: Partial<DaySummary>): DaySummary => ({
  date: "2026-07-28",
  title: null,
  hasData: true,
  steps: 8000,
  sleepMinutes: 400,
  contributions: null,
  disciplineCounts: {},
  monsterDrunk: null,
  ...over,
});

const history = (over: Partial<DaySummary>[]) => over.map((o) => day(o));

describe("StatsTile — GitHub contributions chip", () => {
  it("shows the selected day's contributions", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-28", contributions: 15 }])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.getByText("+15")).toBeTruthy();
  });

  it("stays silent on a measured zero", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-30", contributions: 0 }])}
        selected="2026-07-30"
        state="loaded"
      />,
    );

    expect(screen.queryByTestId("stats-contributions")).toBeNull();
  });

  it("stays silent also when the day was not collected", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-30", contributions: null }])}
        selected="2026-07-30"
        state="loaded"
      />,
    );

    expect(screen.queryByTestId("stats-contributions")).toBeNull();
  });

  it("takes the selected day's figure, not the last one in history", () => {
    render(
      <StatsTile
        history={history([
          { date: "2026-07-28", contributions: 15 },
          { date: "2026-07-29", contributions: 5 },
        ])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.getByTestId("stats-contributions").textContent).toBe("+15");
  });

  /**
   * The colour is a wave token (`--accent-code`), not a green literal: GitHub's green would argue
   * with every wave's palette, which is exactly why the monster flavour colours were dropped. The
   * "zero hardcoded colours" rule stays intact.
   */
  it("painted with a wave token, not a literal", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-28", contributions: 3 }])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.getByTestId("stats-contributions").style.color).toContain("--accent-code");
  });

  /** A tile with no steps and no sleep is empty even with contributions: they do not fill it. */
  it("does not animate an empty tile", () => {
    render(
      <StatsTile
        history={history([{ date: "2026-07-28", steps: null, sleepMinutes: null, contributions: 3 }])}
        selected="2026-07-28"
        state="loaded"
      />,
    );

    expect(screen.queryByTestId("stats-contributions")).toBeNull();
    expect(screen.getByText("нет данных")).toBeTruthy();
  });
});

describe("StatsTile — weekends on the chart axis", () => {
  /**
   * The chart's axis is a scatter of dates with no visible weekly rhythm, so weekend dips read as
   * random (§7.4). They are marked BY A LABEL ON THE AXIS rather than a field fill: the fill was
   * too dark, while the label takes a slot a weekend would have spent on its date anyway.
   */
  const week = (dates: string[]) => history(dates.map((date) => ({ date })));

  // The charts are drawn only from a MEASUREMENT of the container, and jsdom has no
  // `ResizeObserver`: without it no SVG appears at all. We supply one that reports a size at once,
  // because the band lives in pixel geometry and `aspect-ratio` will not stand in for it.
  const realRO = globalThis.ResizeObserver;
  beforeAll(() => {
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb(
          [{ contentRect: { width: 320, height: 160 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterAll(() => {
    globalThis.ResizeObserver = realRO;
  });

  it("labels Saturday and Sunday, and only them", () => {
    // 2026-08-01 is a Saturday and the 2nd a Sunday; the 3rd is a Monday, 31.07 a Friday.
    render(
      <StatsTile
        history={week(["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"])}
        selected="2026-08-03"
        state="loaded"
      />,
    );
    expect(screen.getByTestId("stats-weekday-2026-08-01")).toHaveTextContent("сб");
    expect(screen.getByTestId("stats-weekday-2026-08-02")).toHaveTextContent("вс");
    expect(screen.queryByTestId("stats-weekday-2026-07-31")).toBeNull();
    expect(screen.queryByTestId("stats-weekday-2026-08-03")).toBeNull();
  });

  it("the weekend caption takes the date's slot instead of standing beside it", () => {
    // The owner's main requirement: labels must not overlap. There is one slot on the axis, so a
    // weekend's date is not drawn at all — nothing can overlap by construction.
    render(
      <StatsTile
        history={week(["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"])}
        selected="2026-08-03"
        state="loaded"
      />,
    );
    expect(screen.queryByTestId("stats-tick-2026-08-01")).toBeNull();
    expect(screen.queryByTestId("stats-tick-2026-08-02")).toBeNull();
  });

  it("weekends no longer have a field fill", () => {
    // A regression anchor: the field fill was rejected (DESIGN §7.4).
    render(
      <StatsTile
        history={week(["2026-07-31", "2026-08-01", "2026-08-02"])}
        selected="2026-07-31"
        state="loaded"
      />,
    );
    expect(document.querySelector('[data-testid^="stats-weekend-"]')).toBeNull();
  });
});
