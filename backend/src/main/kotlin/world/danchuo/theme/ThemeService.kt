package world.danchuo.theme

import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped

/**
 * Чтение волн с кэшем Caffeine (PRD §8 — активная тема кэшируется). Токены почти не меняются
 * (смена активной волны — редкое событие владельца), TTL в `application.properties`. Ключа
 * у кэша нет (один активный набор / один список) — `@CacheResult` без `@CacheKey`.
 */
@ApplicationScoped
class ThemeService(
    private val repository: ThemeRepository,
) {

    @CacheResult(cacheName = "theme-active")
    fun active(): ThemeView? = repository.findActive()?.let(ThemeView::from)

    @CacheResult(cacheName = "theme-list")
    fun released(): List<ThemeView> = repository.listReleased().map(ThemeView::from)
}
