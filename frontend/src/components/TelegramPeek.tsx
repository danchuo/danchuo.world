"use client";

import { mediaUrl } from "@/lib/api/media";
import type { TelegramProfileView } from "@/lib/api/types";

/**
 * Визитка Telegram, всплывающая под маркой соцсети (PRD §5.18, DESIGN §7.9).
 *
 * ⚠️ **Это РЕПЛИКА чужого интерфейса, а не наша карточка** — та самая, которую Telegram рисует
 * на `t.me/danchuo`. Пропорции и палитра сняты с её `telegram.css` и остаются такими на любой
 * волне; величина — единственное отступление: все числа страницы умножены на `--tg-scale`,
 * потому что на борде карточка гость над плиткой, а не экран во весь браузер (DESIGN §7.9).
 * Токенов волны здесь НЕТ — цвета и кегли живут в `.tg-peek` (common.css) как брендовые
 * константы, ровно как у соседней карточки Instagram и как фирменные марки платформ лежат
 * готовыми файлами. Взята тёмная тема Telegram: её же показывает сам мессенджер.
 *
 * ⚠️ **Обе ссылки ведут по адресу самой марки.** Оригинал уводит в `tg://resolve?domain=…` —
 * схему приложения, которая у зрителя без установленного Telegram не открывает ничего. Адрес
 * профиля у борда один и лежит в соцссылке, под которой карточка и всплывает.
 *
 * ⚠️ **Всё внутри — мышиное (`tabIndex={-1}`).** Карточка живёт в портале и помечена
 * `aria-hidden` (см. HoverTip): попади в неё фокус, табуляция прыгнула бы в конец документа,
 * мимо самой марки. Ссылки карточки ничего не добавляют к марке, которая и так ведёт в профиль.
 *
 * Пустой статус — законное состояние аккаунта: строку не рисуем вовсе, прочерк в чужом
 * интерфейсе читается поломкой.
 */
export function TelegramPeek({ profile, href }: { profile: TelegramProfileView; href: string }) {
  return (
    <div className="tg-peek">
      <div className="tg-peek__photo">
        <a href={href} target="_blank" rel="noreferrer" tabIndex={-1} aria-label={`Профиль ${profile.username}`}>
          {profile.avatarUrl ? (
            // Аватар снят к себе: зритель борда не ходит за картинкой на CDN мессенджера.
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
