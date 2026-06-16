/**
 * Общий кэш-вайринг (PRD §3.1, §8): in-process Caffeine через `quarkus-cache`.
 * Redis сознательно не нужен в v1.
 *
 * M0 — шов на месте (зависимость подключена). Соглашение для слайсов:
 * - кэш объявляется локально в слайсе (`@CacheResult("<slice>-<что>")`);
 * - инвалидация — при своём `ingest/…` (`@CacheInvalidate` / `@CacheInvalidateAll`);
 * - спец-настройки (TTL и пр.) — в `application.properties` рядом с кэшем-владельцем
 *   (напр. now-playing TTL ~20с в слайсе [world.danchuo.spotify]).
 *
 * Ядро намеренно не вводит общий фасад кэша — это было бы преждевременным
 * обобщением (PRD §3.1, guardrail). Общий тут только сам факт подключения Caffeine.
 */
package world.danchuo.core.cache
