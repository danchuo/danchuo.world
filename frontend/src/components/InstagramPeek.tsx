"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl, photoUrl } from "@/lib/api/media";
import { formatAgo } from "@/lib/format";
import { instagramCommentsUrl, instagramProfileUrl } from "@/lib/instagram";
import { pluralRu } from "@/lib/rideFormat";
import type { InstagramPostView } from "@/lib/api/types";

/** How long the "copied" mark holds — just enough to notice and not to linger. */
const COPIED_MS = 1600;

/**
 * The latest Instagram post, popped up under the social mark. IT IS A REPLICA of someone else's
 * interface: sizes and palette are taken from the live embed and carry NO wave tokens, because
 * recognisability is the only reason it exists. Everything inside is mouse-only. DESIGN §7.9
 */
export function InstagramPeek({ post }: { post: InstagramPostView }) {
  const likes = post.likes;
  const comments = post.comments;
  const profile = instagramProfileUrl(post.username);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = useCallback(() => {
    // The clipboard is not everywhere (an http context, an old browser): stay silent and leave the
    // icon as it was — a false "copied" is worse than no mark.
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
            // The avatar is taken to our side: Instagram's signed link lives hours (PRD §5.17).
            <img className="ig-peek__avatar" src={mediaUrl(post.avatarUrl)} alt="" />
          ) : (
            <span className="ig-peek__avatar ig-peek__avatar--blank" />
          )}
        </span>
        <span className="ig-peek__handle">{post.username}</span>
      </a>

      {post.imageUrl && <img className="ig-peek__shot" src={photoUrl(post.imageUrl)} alt="" />}

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

      {/* The comments themselves do not travel into the card, only their count: reading someone
          else's thread on the board is pointless, while a counter says whether the post is alive. */}
      {comments != null && comments > 0 && (
        <a className="ig-peek__comments" href={instagramCommentsUrl(post.permalink)} target="_blank" rel="noreferrer" tabIndex={-1}>
          {comments.toLocaleString("ru-RU")} {pluralRu(comments, ["комментарий", "комментария", "комментариев"])}
        </a>
      )}

      <p className="ig-peek__stamp">{formatAgo(post.postedAt)}</p>
    </div>
  );
}
