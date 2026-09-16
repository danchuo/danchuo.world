"use client";

import { mediaUrl } from "@/lib/api/media";
import type { TelegramProfileView } from "@/lib/api/types";

/**
 * The Telegram card popping up under the social mark. IT IS A REPLICA of the card Telegram itself
 * draws, scaled down by `--tg-scale` and carrying NO wave tokens. Both links go to the mark's own
 * address — the original's `tg://` scheme opens nothing without the app. Mouse-only. DESIGN §7.9
 */
export function TelegramPeek({ profile, href }: { profile: TelegramProfileView; href: string }) {
  return (
    <div className="tg-peek">
      <div className="tg-peek__photo">
        <a href={href} target="_blank" rel="noreferrer" tabIndex={-1} aria-label={`Профиль ${profile.username}`}>
          {profile.avatarUrl ? (
            // The avatar is taken to our side: a board viewer does not fetch it from a messenger's CDN.
            <img className="tg-peek__image" src={mediaUrl(profile.avatarUrl)} alt="" />
          ) : (
            <span className="tg-peek__image tg-peek__image--blank" />
          )}
        </a>
      </div>

      <div className="tg-peek__title">{profile.name}</div>
      <div className="tg-peek__extra">@{profile.username}</div>
      {profile.bio && <div className="tg-peek__bio">{profile.bio}</div>}

      <div className="tg-peek__action">
        <a className="tg-peek__button" href={href} target="_blank" rel="noreferrer" tabIndex={-1}>
          Send Message
        </a>
      </div>
    </div>
  );
}
