import { BedIcon } from "./StatsIcons";

/**
 * Пустое состояние «сон» (§7.7): пиксельная кровать и одна строка. Одна картинка на оба случая —
 * день без сна и ночь без сохранённых кусков: для зрителя это один и тот же ответ «показать
 * нечего», а прежний текст про минуты объяснял устройство хранения, а не ночь.
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
