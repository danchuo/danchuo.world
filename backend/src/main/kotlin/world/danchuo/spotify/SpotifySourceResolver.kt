package world.danchuo.spotify

import io.quarkus.cache.CacheKey
import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient

/**
 * Резолв имени источника воспроизведения (PRD §M3): `context` отдаёт только тип/ссылку/uri,
 * без имени. Имя плейлиста/артиста добираем отдельным запросом по id из uri и **кэшируем**
 * (имена почти не меняются, TTL в `application.properties`).
 *
 * Отдельный бин (а не метод в [SpotifyService]) — чтобы `@CacheResult` сработал: при
 * self-invocation внутри одного бина CDI-интерцептор кэша не включается.
 */
@ApplicationScoped
class SpotifySourceResolver(
    @param:RestClient private val api: SpotifyApiClient,
    private val tokenService: SpotifyTokenService,
) {

    /**
     * Имя источника по [uri] (`spotify:playlist:ID` / `spotify:artist:ID` /
     * `spotify:user:…:collection`). `null`, если тип без имени или запрос не удался —
     * имя лишь украшение, его отсутствие не должно ронять now-playing.
     */
    @CacheResult(cacheName = "spotify-source-name")
    fun name(@CacheKey uri: String): String? = try {
        val parts = uri.split(":")
        when {
            parts.size >= 3 && parts[1] == "playlist" -> api.playlist(tokenService.bearer(), parts[2], "name").name
            parts.size >= 3 && parts[1] == "artist" -> api.artist(tokenService.bearer(), parts[2]).name
            uri.endsWith(":collection") -> "Любимые треки"
            else -> null
        }
    } catch (_: Exception) {
        null
    }
}
