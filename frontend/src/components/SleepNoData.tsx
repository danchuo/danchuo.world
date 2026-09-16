import { BedIcon } from "./StatsIcons";

/**
 * The "sleep" empty state (§7.7): a pixel bed and one line. One picture for both cases — a day
 * with no sleep and a night with no stored chunks: to a viewer they are the same "nothing to show".
 */
export function SleepNoData() {
  return (
    <div data-testid="sleep-empty" className="flex h-full items-center justify-center gap-4">
      <BedIcon height={62} />
      <span className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
        нет данных о сне
      </span>
    </div>
  );
}
