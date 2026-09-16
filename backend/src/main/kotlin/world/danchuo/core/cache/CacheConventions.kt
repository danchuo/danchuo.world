/**
 * Shared cache wiring: in-process Caffeine via `quarkus-cache`, no Redis in v1. A slice declares
 * its own cache (`@CacheResult("<slice>-<what>")`) and invalidates it from its own ingest. Core
 * deliberately offers no cache facade — that would be premature generalisation. PRD §3.1, §8
 */
package world.danchuo.core.cache
