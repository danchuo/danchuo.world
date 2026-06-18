/**
 * Feature-слайс **spotify** (PRD §3.1, §M3) — внешний музыкальный источник.
 *
 * Доказывает изоляцию внешнего API: весь OAuth/кэш/шифрование живёт здесь, ядро не
 * трогается. Состав слайса:
 * - [world.danchuo.spotify.SpotifyConfig] — креды/скоупы/ключ шифрования (из env).
 * - [world.danchuo.spotify.SpotifyToken] + репозиторий + [world.danchuo.spotify.SpotifyCrypto]
 *   — refresh-токен шифрованно at-rest (AES-GCM, §8).
 * - [world.danchuo.spotify.SpotifyTokenService] — one-time обмен кода и прозрачный
 *   рефреш access-токена; [world.danchuo.spotify.SpotifyAuthResource] — OAuth-флоу.
 * - [world.danchuo.spotify.SpotifyApiClient]/[world.danchuo.spotify.SpotifyAccountsClient]
 *   — REST-клиенты к Spotify; [world.danchuo.spotify.SpotifyService] — кэш Caffeine
 *   (now-playing ~20с, recent/top — минуты) гасит нагрузку.
 * - [world.danchuo.spotify.SpotifyResource] — публичные `GET /api/spotify/…`.
 */
package world.danchuo.spotify
