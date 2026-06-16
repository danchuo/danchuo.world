/**
 * Feature-слайс **spotify** (PRD §3.1; M3) — пустой шов M0.
 *
 * Зона ответственности (M3): внешний OAuth (refresh-токен шифруется at-rest),
 * `GET /api/spotify/…` (now-playing + recent). Caffeine-кэш гасит нагрузку
 * (now-playing TTL ~20с). Доказывает изоляцию внешнего источника: весь
 * OAuth/кэш живёт здесь, ядро не трогается.
 */
package world.danchuo.spotify
