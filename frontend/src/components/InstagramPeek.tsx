"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/api/media";
import { formatAgo } from "@/lib/format";
import { instagramCommentsUrl, instagramProfileUrl } from "@/lib/instagram";
import { pluralRu } from "@/lib/rideFormat";
import type { InstagramPostView } from "@/lib/api/types";

/** Сколько держится отметка «скопировано» — ровно чтобы заметить и не залипнуть. */
const COPIED_MS = 1600;

/**
 * Последний пост Instagram, всплывающий под маркой соцсети (PRD §5.17, DESIGN §7.9).
 *
 * ⚠️ **Это РЕПЛИКА чужого интерфейса, а не наша карточка.** Размеры и палитра сняты с живого
 * эмбеда `instagram.com/p/…/embed` и остаются такими на любой волне: аватар 30px в кольце 34px,
 * ник 14/18 полужирным, подпись 14/18, вставка 10px, системный шрифт Instagram. Поэтому здесь
 * НЕТ токенов волны — цвета и кегли живут в `.ig-peek` (common.css) как брендовые константы,
 * ровно как фирменные марки платформ лежат готовыми файлами. Причёсывать реплику под волну
 * значит потерять то единственное, ради чего она есть: узнаваемость с первого взгляда.
 * Волна решает лишь, ПОКАЗЫВАТЬ ли её (редакция `peek`, DESIGN §10.1).
 *
 * ⚠️ **Полоса действий — рабочая, но ведёт туда, куда Instagram пускает по ссылке.** Лайк и
 * закладка открывают сам пост (адреса, выполняющего действие, у платформы нет), комментарий —
 * `…/comments/`, а «поделиться» копирует ссылку: это единственное действие, которое мы правда
 * выполняем сами. Разбор — во врезе `lib/instagram.ts`.
 *
 * ⚠️ **Всё внутри — мышиное (`tabIndex={-1}`).** Карточка живёт в портале и помечена
 * `aria-hidden` (см. HoverTip): попади в неё фокус, табуляция прыгнула бы в конец документа,
 * мимо самой марки. Ссылки карточки ничего не добавляют к марке, которая и так ведёт в профиль.
 *
 * Счётчик, спрятанный владельцем у поста, приезжает `null` — строку не рисуем вовсе: ноль
 * соврал бы, а «—» в чужом интерфейсе выглядит поломкой.
 */
export function InstagramPeek({ post }: { post: InstagramPostView }) {
  const likes = post.likes;
  const comments = post.comments;
  const profile = instagramProfileUrl(post.username);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = useCallback(() => {
    // Буфер обмена есть не везде (http-контекст, старый браузер) — молчим и оставляем значок
    // как был: ложная отметка «скопировано» хуже, чем отсутствие отметки.
    navigator.clipboard?.writeText(post.permalink).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }, () => undefined);
  }, [post.permalink]);

  return (
    <div className="ig-peek">
      <a className="ig-peek__head" href={profile} target="_blank" rel="noreferrer" tabIndex={-1} aria-label={`Профиль ${post.username}`}>
        <span className="ig-peek__ring">
          {post.avatarUrl ? (
            // Аватар снят к себе: подписанная ссылка Instagram живёт часами (PRD §5.17).
            <img className="ig-peek__avatar" src={mediaUrl(post.avatarUrl)} alt="" />
          ) : (
            <span className="ig-peek__avatar ig-peek__avatar--blank" />
          )}
        </span>
        <span className="ig-peek__handle">{post.username}</span>
      </a>

      {post.imageUrl && <img className="ig-peek__shot" src={mediaUrl(post.imageUrl)} alt="" />}

      <div className="ig-peek__actions">
        <a className="ig-peek__act" href={post.permalink} target="_blank" rel="noreferrer" tabIndex={-1} aria-label="Нравится">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20.5C6.5 16.8 3 13.9 3 10.2 3 7.6 5 5.7 7.4 5.7c1.5 0 2.9.7 3.7 1.9l.9 1.3.9-1.3c.8-1.2 2.2-1.9 3.7-1.9C19 5.7 21 7.6 21 10.2c0 3.7-3.5 6.6-9 10.3z" />
          </svg>
        </a>
        <a className="ig-peek__act" href={instagramCommentsUrl(post.permalink)} target="_blank" rel="noreferrer" tabIndex={-1} aria-label="Комментировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6-1 0-2-.2-2.9-.5l-5.1 1.6 1.7-4.4a7.2 7.2 0 0 1-1.7-4.6c0-4.2 3.8-7.6 8.5-7.6s8 3.4 8 7.9z" />
          </svg>
        </a>
        <button className="ig-peek__act" type="button" onClick={copy} tabIndex={-1} aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}>
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5v13M12 3.5 7.5 8M12 3.5 16.5 8M4.5 15v3.5A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2V15" />
            </svg>
          )}
        </button>
        <a className="ig-peek__act ig-peek__save" href={post.permalink} target="_blank" rel="noreferrer" tabIndex={-1} aria-label="Сохранить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.8h12v16.4l-6-4.3-6 4.3z" />
          </svg>
        </a>
      </div>

      {likes != null && <p className="ig-peek__counts">{likes.toLocaleString("ru-RU")} отметок «Нравится»</p>}

      {post.caption && (
        <p className="ig-peek__caption">
          <b>{post.username}</b> {post.caption}
        </p>
      )}

      {/* Сами комментарии в карточку не едут — только их число: читать чужую переписку на борде
          незачем, а счётчик говорит, живой ли пост. Ссылка ведёт туда, где они есть. */}
      {comments != null && comments > 0 && (
        <a className="ig-peek__comments" href={instagramCommentsUrl(post.permalink)} target="_blank" rel="noreferrer" tabIndex={-1}>
          {comments.toLocaleString("ru-RU")} {pluralRu(comments, ["комментарий", "комментария", "комментариев"])}
        </a>
      )}

      <p className="ig-peek__stamp">{formatAgo(post.postedAt)}</p>
    </div>
  );
}
