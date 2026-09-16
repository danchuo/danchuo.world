package world.danchuo.spotify

import io.quarkus.cache.CacheKey
import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient

/**
 * Resolves the playback source's name: `context` gives only a type, link and uri, so the playlist
 * or artist name is fetched by id and cached (names barely change). It is a separate bean so that
 * `@CacheResult` fires at all — the cache interceptor is skipped on self-invocation.
 */
@ApplicationScoped
class SpotifySourceResolver(
    @param:RestClient private val api: SpotifyApiClient,
    private val tokenService: SpotifyTokenService,
) {

    /**
     * The source name for [uri] (`spotify:playlist:ID` / `spotify:artist:ID` / a collection).
     * `null` when the type has no name or the request failed — the name is only decoration and
     * its absence must not bring down now-playing.
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
