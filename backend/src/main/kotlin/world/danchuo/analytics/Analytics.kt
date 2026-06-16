/**
 * Feature-слайс **analytics** (PRD §3, §3.1; M4) — пустой шов M0.
 *
 * Зона ответственности (M4): `AnalyticsEvent` + cookieless бикон-эндпоинт
 * (своё решение в Postgres, без третьих сторон). Запись событий — публичный POST
 * бикона (не ingest-мутация владельца), чтение/агрегаты — приватные/служебные.
 */
package world.danchuo.analytics
