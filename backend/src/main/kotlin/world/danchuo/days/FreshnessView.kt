package world.danchuo.days

import java.time.Instant

/**
 * Проекция свежести данных (PRD §8) для тихого индикатора в UI.
 * [lastIngestAt] `null` = приёмов ещё не было ⇒ фронт показывает пусто.
 */
data class FreshnessView(val lastIngestAt: Instant?)
