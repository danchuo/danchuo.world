package world.danchuo.spotify

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.days.DayRecordService
import java.time.Instant

/**
 * Background recording of listened podcasts; only sessions and the derived mark leave the slice.
 * It needs its own tick because the now-playing poll is driven by VIEWERS — nobody opens the
 * board, an hour of listening is lost. Why polling and not a ready history: PRD §5.6.
 */
@ApplicationScoped
class PodcastPoller(
    @param:RestClient private val api: SpotifyApiClient,
    private val tokenService: SpotifyTokenService,
    private val config: SpotifyConfig,
    private val listens: PodcastListenService,
    private val days: DayRecordService,
    private val mskTime: MskTime,
) {

    private val log: Logger = Logger.getLogger(PodcastPoller::class.java)

    @Scheduled(
        every = "{danchuo.spotify.podcast.poll-interval}",
        delayed = "45s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.podcast().enabled() || !config.isConfigured()) return
        runCatching { pollOnce() }
            .onFailure {
                // No OAuth yet — a normal state, not a breakage: stay silent.
                if (it !is SpotifyNotConnectedException) {
                    log.warn("spotify: опрос подкаста не удался (сеть/токен?): ${it.message}")
                }
            }
    }

    /** One sample. Returns credited milliseconds: 0 on a pause, on music, or on nothing playing. */
    fun pollOnce(): Long {
        val sample = sample() ?: return 0
        val credited = listens.record(sample, mskTime.today(), Instant.now())
        // The day projection depends on minutes and cards; drop it only once they have moved.
        if (credited > 0) days.invalidateProjection()
        return credited
    }

    /** Takes a sample off the player; `null` when it is not a podcast or fields are missing. */
    private fun sample(): EpisodeSample? {
        // A 204 (nothing playing) means a null body. A pause reaches here and gives a zero delta.
        val current = api.currentlyPlaying(
            tokenService.bearer(),
            ADDITIONAL_TYPES,
            config.podcast().market(),
        ) ?: return null

        if (current.currentlyPlayingType != EPISODE_TYPE) return null
        val item = current.item ?: return null
        val show = item.show

        return EpisodeSample(
            episodeId = item.id ?: return null,
            progressMs = current.progressMs ?: return null,
            episodeName = item.name ?: return null,
            episodeUrl = item.externalUrls?.spotify,
            showId = show?.id,
            // The show name is the card's author; the player returns no publisher and the name is
            // enough. Without a show an episode is not a card — skip the sample entirely.
            showName = show?.name ?: return null,
            showUrl = show?.externalUrls?.spotify,
            imageUrl = item.images.smallestAtLeast(THUMB_MIN_PX) ?: show?.images.smallestAtLeast(THUMB_MIN_PX),
            episodeDurationMs = item.durationMs,
        )
    }

    /**
     * The smallest cover no smaller than [minPx] — a card needs an icon, not a 640x640 canvas.
     * Spotify serves 640/300/64; we take 300, leaving 64 as a fallback when no larger one exists.
     */
    private fun List<SpotifyImage>?.smallestAtLeast(minPx: Int): String? =
        orEmpty().filter { (it.width ?: 0) >= minPx }.minByOrNull { it.width ?: Int.MAX_VALUE }?.url
            ?: orEmpty().maxByOrNull { it.width ?: 0 }?.url

    private companion object {
        /** Without `episode` in the list a podcast does not arrive at all (Spotify compatibility). */
        const val ADDITIONAL_TYPES = "track,episode"
        const val EPISODE_TYPE = "episode"

        /** Lower bound of the card cover, px. */
        const val THUMB_MIN_PX = 300
    }
}
