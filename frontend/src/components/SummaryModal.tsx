"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getSummary } from "@/lib/api/client";
import type { SummarySubject } from "@/lib/summarySubject";
import { Icon } from "./Icon";
import { Cover } from "./NowPlayingCard";
import { useBackToClose } from "./useBackToClose";

interface SummaryModalProps {
  subject: SummarySubject;
  onClose: () => void;
}

/**
 * Окно «что было в этом куске» (PRD §5.16.1) — раскрывается кнопкой на карточке прочитанного
 * или прослушанного.
 *
 * **Окно одно на оба предмета.** Вопрос («что там было») и ответ (пункты плюс строка-итог) от
 * того, читали или слушали, не зависят; различается ровно шапка, и она приезжает сюда готовым
 * предметом ([SummarySubject]). Два похожих окна разошлись бы по мелочам при первой же правке
 * одного из них — а борд обязан отвечать на один вопрос одинаково.
 *
 * Контур общий с модалками поездок и фото-дропов (DESIGN §7.6): затемнённый фон, закрытие по
 * `×`/`Esc`/клику мимо панели, фокус-трап. Порядок внутри повторяет вопрос владельца: сверху
 * предмет (обложка, название, подпись), посередине — пройденный кусок крупно, снизу — пункты.
 *
 * **Текст тянется лениво.** В карточке дня едет только флаг «есть что рассказать»: пересказ —
 * это несколько строк на заход, а дней в окне календаря десятки. Пока он едет, окно уже
 * показывает шапку и кусок — то есть ровно то, что и так известно борду (DESIGN §7: лоадер
 * уместен только там, где показать нечего).
 *
 * Пересказ собран по тексту самого источника, а не по памяти модели, — поэтому в окне нет
 * никаких оговорок про достоверность: их нечем было бы подкрепить, а без источника кнопки
 * просто нет.
 */
export function SummaryModal({ subject, onClose }: SummaryModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [takeaway, setTakeaway] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const { kind, sessionId } = subject;

  useEffect(() => {
    const ctrl = new AbortController();
    getSummary(kind, sessionId, { signal: ctrl.signal })
      .then((data) => {
        // Ответу НЕ доверяем на слово. Прилетевший `{}` (так native-образ отдавал ответ без
        // `@RegisterForReflection`) раньше валил `bullets.map` — и падал не пересказ, а весь
        // борд: клиентское исключение уносит страницу целиком в error-экран Next. Пустой
        // пересказ и сломанный ответ для окна одно и то же — строка «не собрался».
        const lines = Array.isArray(data?.bullets)
          ? data.bullets.filter((line): line is string => typeof line === "string" && line.trim() !== "")
          : [];
        if (lines.length === 0) {
          setFailed(true);
          return;
        }
        setBullets(lines);
        setTakeaway(typeof data.takeaway === "string" && data.takeaway.trim() !== "" ? data.takeaway : null);
      })
      .catch(() => {
        // Прервали загрузку закрытием окна — не ошибка; всё остальное честно говорим строкой.
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [kind, sessionId]);

  // Системное «Назад» закрывает окно, а не уводит с сайта (DESIGN §9).
  useBackToClose(true, onClose);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-scale fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(33, 26, 22, 0.55)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={subject.ariaLabel}
        className="pixel-tile flex w-full max-w-md flex-col p-4"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="summary-modal"
      >
        <span className="pixel-slab" aria-hidden />
        <span className="pixel-lid" aria-hidden />

        {/* Шапка — тот же предмет, что на карточке: обложка, название, подпись. Колонкой по
            центру (решение владельца): в модалке речь об ОДНОЙ вещи, и её обложка — предмет
            разговора, а не иконка строки списка. Прижатая к левому краю, она читалась как
            аватарка. Крестик при этом уходит в угол абсолютом, иначе он растянул бы центр вбок. */}
        <div className="relative mb-3 flex shrink-0 flex-col items-center text-center">
          <button
            ref={closeRef}
            type="button"
            className="tap-target absolute right-0 top-0"
            onClick={onClose}
            aria-label="Закрыть"
            style={{ ...mono, ...meta, cursor: "pointer", background: "none", border: "none", display: "inline-flex" }}
          >
            <Icon name="close" size={18} />
          </button>
          {/* Та же обложка тем же компонентом, что в карточке и в плитке плеера. У книги она
              портретная (корешок), у выпуска квадратная (конверт) — отсюда разная высота при
              одной ширине. Крупнее карточной: здесь она несёт шапку одна, а не подпирает
              строку текста сбоку. */}
          <Cover
            url={subject.coverUrl}
            alt=""
            size={COVER_W}
            height={subject.portrait ? COVER_H_PORTRAIT : COVER_W}
          />
          <div className="mt-2 max-w-full px-6">
            <div style={{ fontSize: "var(--fs-modal-title)", color: "var(--text-primary)" }}>
              {subject.title}
            </div>
            {subject.byline && <div style={{ ...mono, ...meta }}>{subject.byline}</div>}
          </div>
        </div>

        {/* Пройденный кусок — крупно и по центру: это и есть заголовок разговора. */}
        {subject.progressValue && (
          <div className="shrink-0 text-center" style={progressBlock} data-testid="summary-progress">
            <div style={progressCaption}>{subject.progressCaption}</div>
            <div style={progressValue}>{subject.progressValue}</div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {bullets ? (
            <>
              <ul className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {bullets.map((line) => (
                  <li key={line} className="flex gap-2" style={{ ...mono, ...body }}>
                    <span aria-hidden style={{ color: "var(--accent)" }}>·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {takeaway && (
                <p style={{ ...mono, ...takeawayStyle }} data-testid="summary-takeaway">
                  {takeaway}
                </p>
              )}
            </>
          ) : (
            <p style={{ ...mono, ...meta }}>
              {failed ? "пересказ не собрался" : "собираю пересказ…"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Обложка шапки: ширина одна на оба предмета, высота — по пропорции своего. */
const COVER_W = 60;
const COVER_H_PORTRAIT = 90;

const mono = { fontFamily: "var(--font-mono)" } satisfies CSSProperties;

const meta = {
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-tertiary)",
} satisfies CSSProperties;

const body = {
  fontSize: "var(--fs-modal-row)",
  color: "var(--text-primary)",
  lineHeight: 1.45,
} satisfies CSSProperties;

/* Кусок стоит отдельным блоком между шапкой и пунктами, отбитый линиями: он отвечает на
   «сколько», а пункты — на «что», и смешивать эти два ответа в один поток не стоит. */
const progressBlock = {
  padding: "10px 0 12px",
  marginBottom: 12,
  borderTop: "1px solid var(--border-tile, var(--border))",
  borderBottom: "1px solid var(--border-tile, var(--border))",
} satisfies CSSProperties;

const progressCaption = {
  ...mono,
  fontSize: "var(--fs-modal-small)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  marginBottom: 2,
} satisfies CSSProperties;

const progressValue = {
  ...mono,
  fontSize: "var(--fs-modal-title)",
  fontWeight: 600,
  color: "var(--accent)",
} satisfies CSSProperties;

/* Итог — не шестой пункт, а фраза про весь кусок: отбит сверху и набран приглушённее. */
const takeawayStyle = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid var(--border-tile, var(--border))",
  fontSize: "var(--fs-modal-meta)",
  color: "var(--text-secondary)",
  lineHeight: 1.45,
} satisfies CSSProperties;
