"use client";

import { mediaUrl } from "@/lib/api/media";
import { formatAgo } from "@/lib/format";
import type { InstagramPostView } from "@/lib/api/types";

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
 * Счётчик, спрятанный владельцем у поста, приезжает `null` — строку не рисуем вовсе: ноль
 * соврал бы, а «—» в чужом интерфейсе выглядит поломкой.
 */
export function InstagramPeek({ post }: { post: InstagramPostView }) {
  const likes = post.likes;
  const comments = post.comments;

  return (
    <div className="ig-peek">
      <div className="ig-peek__head">
        <span className="ig-peek__ring">
          {post.avatarUrl ? (
            // Аватар снят к себе: подписанная ссылка Instagram живёт часами (PRD §5.17).
            <img className="ig-peek__avatar" src={mediaUrl(post.avatarUrl)} alt="" />
          ) : (
            <span className="ig-peek__avatar ig-peek__avatar--blank" />
          )}
        </span>
        <span className="ig-peek__who">
          <span className="ig-peek__handle">{post.username}</span>
          {post.mediaType === "CAROUSEL_ALBUM" && <span className="ig-peek__sub">несколько кадров</span>}
          {post.mediaType === "VIDEO" && <span className="ig-peek__sub">видео</span>}
        </span>
      </div>

      {post.imageUrl && <img className="ig-peek__shot" src={mediaUrl(post.imageUrl)} alt="" />}

      {/* Полоса действий — часть облика поста, но не органы управления: лайкать отсюда нечего,
          поэтому это рисунок (`aria-hidden`), а не кнопки, которые никуда не ведут. */}
      <div className="ig-peek__actions" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20.5C6.5 16.8 3 13.9 3 10.2 3 7.6 5 5.7 7.4 5.7c1.5 0 2.9.7 3.7 1.9l.9 1.3.9-1.3c.8-1.2 2.2-1.9 3.7-1.9C19 5.7 21 7.6 21 10.2c0 3.7-3.5 6.6-9 10.3z" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6-1 0-2-.2-2.9-.5l-5.1 1.6 1.7-4.4a7.2 7.2 0 0 1-1.7-4.6c0-4.2 3.8-7.6 8.5-7.6s8 3.4 8 7.9z" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5v13M12 3.5 7.5 8M12 3.5 16.5 8M4.5 15v3.5A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2V15" />
        </svg>
        <svg className="ig-peek__save" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3.8h12v16.4l-6-4.3-6 4.3z" />
        </svg>
      </div>

      {likes != null && <p className="ig-peek__counts">{likes.toLocaleString("ru-RU")} отметок «Нравится»</p>}

      {post.caption && (
        <p className="ig-peek__caption">
          <b>{post.username}</b> {post.caption}
        </p>
      )}

      {comments != null && comments > 0 && (
        <p className="ig-peek__comments">Посмотреть все {comments.toLocaleString("ru-RU")} комментариев</p>
      )}

      <p className="ig-peek__stamp">{formatAgo(post.postedAt)} назад</p>
    </div>
  );
}
