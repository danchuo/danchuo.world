package world.danchuo.theme

import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped

/**
 * Reads waves through a Caffeine cache: tokens barely change, since switching the active wave is a
 * rare owner event, and the TTL lives in `application.properties`. The cache needs no key — there
 * is one active set and one list — so `@CacheResult` carries no `@CacheKey`. PRD §8
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
