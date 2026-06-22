/**
 * Feature-слайс **analytics** (PRD §3, §3.1, §5.11; M4) — наполнен в M4.
 *
 * Своё cookieless-решение в Postgres, без третьих сторон. `AnalyticsEvent` (сырьё; сырой
 * IP не хранится — только суточный хэш [VisitorHash]) → [AnalyticsService] (запись +
 * сводка) → публичный бикон [AnalyticsBeaconResource] (`POST /api/analytics/beacon`, вне
 * `api/ingest`) и приватная сводка [AnalyticsSummaryResource] (`GET /api/ingest/analytics/
 * summary`, за bearer). Боты метятся [BotHeuristics] и исключаются из сводки.
 *
 * **B2 (хитмапа):** потайловые клики — `InteractionEvent` (доля внутри тайла, не пиксели) →
 * [InteractionService] (батч-запись с валидацией + потайловый агрегат с cap-вклада) →
 * публичный сбор [InteractionResource] (`POST /api/analytics/interactions`) и приватная
 * хитмапа `GET /api/ingest/analytics/heatmap` (тот же [AnalyticsSummaryResource]).
 */
package world.danchuo.analytics
