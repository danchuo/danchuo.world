"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getRides } from "@/lib/api/client";
import type { RideView } from "@/lib/api/types";
import { mskToday } from "@/lib/date";
import { relativeDayRu } from "@/lib/relativeDay";
import { formatDuration, formatKm } from "@/lib/rideFormat";
import { RideMap } from "./RideMap";
import { RidesModal } from "./RidesModal";
import { TileShell } from "./TileShell";
import { useTileData } from "./useTileData";

/**
 * Редакции виджета (DESIGN §10.1) — выбирает ВОЛНА через раскладку (`tiles.ride.edition`),
 * компонент о волнах не знает. Незнакомое значение ⇒ `card`.
 * - `card` — досье поездки: мини-карта сверху, цифры под ней, «предыдущие» отдельной кнопкой;
 * - `map`  — карта во всю плитку, данные последней поездки лежат НА ней полосой блюра,
 *            и вся плитка целиком — вход в модалку.
 *
 * Редакция общая на плитку и на её модалку: это две стороны одного виджета, и разъехаться
 * им нечем — карту, вылетающую из плитки в окно другой вёрстки, пришлось бы согласовывать
 * дважды.
 */
export type RideEdition = "card" | "map";

interface RideTileProps {
  /** Активная волна — пробрасывается в мини-карту для выбора пиксельных пинов (DESIGN §12). */
  wave?: string | null;
  /** Редакция из раскладки волны (строка как есть; проверяется здесь). */
  edition?: string;
  style?: CSSProperties;
  className?: string;
}

function resolveEdition(value: string | undefined): RideEdition {
  return value === "map" ? "map" : "card";
}

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

/**
 * Виджет последней поездки Велобайк (B4, PRD §9, DESIGN §7.6). Геоданных всего две точки —
 * старт и финиш, — и обе редакции ([RideEdition]) показывают их картой; расходятся они в том,
 * что вокруг карты. `card` — досье: мини-карта, под ней цифры и кнопка «предыдущие». `map` —
 * карта во всю плитку, цифры последней поездки лежат на ней полосой блюра, а входом в модалку
 * работает вся плитка. Обе ведут в одну модалку [RidesModal], и редакцию она получает ту же.
 * Пусто до первого ingest — тихий empty (§7). Ноль хардкод-цветов (токены волны).
 */
export function RideTile({ wave, edition: editionRaw, style, className }: RideTileProps) {
  const edition = resolveEdition(editionRaw);
  const { phase, data, retry } = useTileData<RideView[]>(
    useCallback((signal) => getRides({ signal }), []),
    "rides",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const today = mskToday();
  const rides = data ?? [];
  const latest = rides[0];
  const isEmpty = phase === "loaded" && rides.length === 0;

  const hasCoords =
    latest?.startLat != null &&
    latest?.startLon != null &&
    latest?.finishLat != null &&
    latest?.finishLon != null;

  /**
   * Карта на плитке — источник проявки (DESIGN §7.5): из неё вырастает карта в модалке.
   * Ссылка, а не прямоугольник: снимать его надо и на открытии, и на закрытии.
   */
  const mapCardRef = useRef<HTMLButtonElement>(null);

  /**
   * Приехали ли первые тайлы карты. Редакция `map` — это карта во всю плитку, и до них на
   * экране стоял её каркас: подложка, пины и полоса данных на пустом месте, а через секунду
   * под ними проявлялся город. Плитка
   * ждёт карту и появляется ВМЕСТЕ с ней — тот же размен, что у плитки последнего дропа,
   * ждущей свой снимок, и у модалки поездок, ждущей карту перед проявкой (§7.6).
   *
   * Гасим ПРОЗРАЧНОСТЬЮ, а не размонтированием: карте надо быть в разметке, чтобы начать
   * грузиться и было чему доехать (тот же приём, что у ленты дропов с её `.is-ready`).
   */
  const [mapReady, setMapReady] = useState(false);

  /**
   * Высота полосы данных — замером, а не числом в коде: её задаёт CSS (`--ride-band-*` плюс сам
   * текст), и карта обязана увести маршрут из-под неё ровно на столько, сколько полоса заняла.
   * Узел в state (callback-ref), а не в ref: полоса появляется ПОСЛЕ ответа сети, и замер,
   * привязанный к фазе, не перезапустился бы (та же ловушка, что у мозаики дропа).
   */
  const [bandEl, setBandEl] = useState<HTMLElement | null>(null);
  const [bandH, setBandH] = useState(0);
  useEffect(() => {
    if (!bandEl) return;
    const measure = () => setBandH(bandEl.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return; // jsdom-тесты без ResizeObserver
    const ro = new ResizeObserver(measure);
    ro.observe(bandEl);
    return () => ro.disconnect();
  }, [bandEl]);

  return (
    <>
      <TileShell
        state={isEmpty ? "empty" : phase}
        emptyText="поездок пока нет"
        onRetry={retry}
        label="велобайк"
        ariaLabel="Последняя поездка на Велобайке"
        style={style}
        className={`${edition === "map" ? "ride-card--map" : ""}${
          edition === "map" && (mapReady || !hasCoords) ? " is-ready" : ""
        } ${className ?? ""}`}
      >
      {phase === "loaded" && !isEmpty && latest && edition === "map" && (
        // Карта во всю плитку, данные — полосой блюра НА ней (та же мысль, что у полосы подписи
        // в плитке дропа, §7.5): у виджета нет ни полей, ни второй колонки, весь его предмет —
        // карта. Плитка целиком одна кнопка: «предыдущие» отдельной строкой тут негде и незачем
        // рисовать — нажатие в любую точку открывает модалку.
        <button
          ref={mapCardRef}
          type="button"
          onClick={() => setModalOpen(true)}
          className="ride-frame"
          aria-label="Открыть карту поездок"
        >
          {hasCoords ? (
            <RideMap
              className="ride-frame__map"
              startLat={latest.startLat!}
              startLon={latest.startLon!}
              finishLat={latest.finishLat!}
              finishLon={latest.finishLon!}
              wave={wave}
              padTop={bandH}
              onReady={() => setMapReady(true)}
            />
          ) : (
            <span className="ride-frame__map" style={{ background: "var(--bg-surface-muted)" }} aria-hidden />
          )}
          {/* Блюр полосы — ДВА прохода `backdrop-filter` во всю плитку, маской открытые только
              сверху. Во всю плитку намеренно: выборка backdrop-filter зажимается краями своего
              бокса, и полоса ростом с саму себя дала бы смаз вдоль нижней кромки (та же серая
              линия, что ловили на плитке дропа, docs/pitfalls.md). У слоя ростом с карту кромки
              совпадают с кромками карты — смазу неоткуда взяться внутри кадра. Копией картинки,
              как у дропа, тут не обойтись: под полосой не снимок, а живая карта Leaflet. */}
          <span className="ride-frame__blur ride-frame__blur--soft" aria-hidden />
          <span className="ride-frame__blur ride-frame__blur--deep" aria-hidden />
          {/* Подпись — ОДНОЙ строкой и тем же приёмом, что подпись кадра в плитке дропа
              (`.drop-frame__caption`): крупное главное слева, всё остальное моно-мелочью при
              нём. Родство не косметическое — обе полосы лежат на прогрессивном блюре поверх
              чужой картинки и стоят рядом на одном борде; разъехавшись строем, читались бы
              двумя разными приёмами вместо одного (выбор владельца).
              Прежние две строки («последняя / вчера» над «км / мин», прижатые к разным краям)
              делали из подписи таблицу — здесь ей нечего табулировать. */}
          <span ref={setBandEl} className="ride-frame__band">
            <span className="ride-frame__caption">
              <span className="ride-frame__km">{formatKm(latest.distanceMeters)}</span>
              <span className="ride-frame__meta">
                последняя · {relativeDayRu(latest.rideDate, today)} ·{" "}
                {formatDuration(latest.durationSeconds)}
              </span>
            </span>
          </span>
        </button>
      )}

      {phase === "loaded" && !isEmpty && latest && edition === "card" && (
        <div className="tile-frame flex h-full flex-col gap-2">
          {hasCoords && (
            // Клик по карте открывает модалку поездок (карта статична и pointer-events:none —
            // клики доходят до кнопки). Тот же вход, что и «предыдущие».
            <button
              ref={mapCardRef}
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Открыть карту поездок"
              // Геометрия бокса — в классе .ride-map-box: в бенто это доля высоты тайла, в стеке
              // (§8) её нет вовсе, и карта инициализировалась в нулевую высоту (пустое место).
              className="ride-map-box tap-target"
              style={{
                overflow: "hidden",
                borderRadius: "var(--radius-sm)",
                border: "none",
                padding: 0,
                background: "none",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              <RideMap
                startLat={latest.startLat!}
                startLon={latest.startLon!}
                finishLat={latest.finishLat!}
                finishLon={latest.finishLon!}
                wave={wave}
              />
            </button>
          )}

          <div className="flex flex-col gap-1">
            {/* «Когда» слева, «предыдущие» — по правому краю той же строки. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="t-ride-when" style={{ color: "var(--text-secondary)" }}>{relativeDayRu(latest.rideDate, today)}</span>
              {rides.length > 1 && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  aria-label="Предыдущие поездки"
                  className="tap-target t-ride-more shrink-0 cursor-pointer"
                  style={{ ...mono, color: "var(--accent)", background: "none", border: "none" }}
                >
                  предыдущие
                </button>
              )}
            </div>

            {/* Цифры на тайле: дистанция (крупно) слева, длительность (чуть меньше) прижата к
                правому краю — чтобы правая сторона не пустовала. Калории на тайле не показываем —
                они остаются только в модалке (строки списка). */}
            <div className="flex items-baseline justify-between gap-x-2" style={{ ...mono, color: "var(--text-primary)" }}>
              <span className="t-ride-km" style={{ lineHeight: 1 }}>{formatKm(latest.distanceMeters)}</span>
              <span className="t-ride-dur" style={{ color: "var(--text-secondary)" }}>{formatDuration(latest.durationSeconds)}</span>
            </div>

          </div>
        </div>
      )}
      </TileShell>

      {/* Модалка — сиблинг TileShell (не внутри): у .pixel-tile clip-path/тень создают
          containing block, и fixed-оверлей внутри тайла обрезался бы им вместо вьюпорта.
          Тот же приём, что у фото-дропов (§7.5) — окно сверху на весь экран. */}
      {modalOpen && (
        <RidesModal
          rides={rides}
          today={today}
          wave={wave}
          edition={editionRaw}
          // Карта на плитке — то, из чего растёт карта модалки (проявка, §7.5). Ссылку даём
          // всегда: играть проявку или нет, решает скин волны (`--drop-morph`), а не редакция.
          origin={mapCardRef}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
