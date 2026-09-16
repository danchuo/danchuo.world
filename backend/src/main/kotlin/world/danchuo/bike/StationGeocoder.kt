package world.danchuo.bike

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.rest.client.inject.RestClient
import org.jboss.logging.Logger
import java.time.Clock
import java.time.Instant

/**
 * Background station geocoder: ONE address per tick, which keeps us inside public Nominatim's
 * usage policy and never blocks ingest. A unique address is geocoded once, "not found" included,
 * and any failure degrades quietly to the GPS fallback. Why at all: PRD §7 (BikeStation).
 */

/*
 * Moscow addresses with a block or letter suffix geocode poorly, so [candidates] tries several
 * forms from precise to coarse and the first hit wins — a pin on the street is metres off, which
 * still beats a GPS fix thrown across the city.
 */
@ApplicationScoped
class StationGeocoder(
    @RestClient private val nominatim: NominatimApi,
    private val stations: BikeStationRepository,
    private val rides: RideRepository,
    private val clock: Clock,
    @ConfigProperty(name = "danchuo.bike.geocode.enabled") private val enabled: Boolean,
    @ConfigProperty(name = "danchuo.bike.geocode.user-agent") private val userAgent: String,
) {

    private val log = Logger.getLogger(StationGeocoder::class.java)

    /**
     * One tick: take a ride address not yet attempted and write it to the cache (coordinates or
     * "not found"). A network failure exits without writing, to retry next tick; all variants
     * empty writes `found = false` so the address is never hammered again.
     */
    @Transactional
    @Scheduled(every = "{danchuo.bike.geocode.interval}", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    fun tick() {
        if (!enabled) return
        val known = stations.knownAddresses()
        val address = rides.distinctAddresses().firstOrNull { it !in known } ?: return

        val coords = try {
            // A bare-city placeholder is not geocoded: its centroid would mask the exact GPS.
            if (isCityPlaceholder(address)) null else geocode(address)
        } catch (e: Exception) {
            log.warn("Nominatim geocode failed for '$address' (retry next tick): ${e.message}")
            return
        }

        val station = (stations.byAddress(address) ?: BikeStation().apply { this.address = address }).apply {
            lat = coords?.first
            lon = coords?.second
            found = coords != null
            geocodedAt = Instant.now(clock)
        }
        if (station.id == null) stations.persist(station)
        log.info("Geocoded station '$address' → ${if (coords != null) "$coords" else "not found"}")
    }

    /** Tries query variants from precise to coarse; the first non-empty match wins. */
    private fun geocode(address: String): Pair<Double, Double>? {
        for ((i, query) in candidates(address).withIndex()) {
            if (i > 0) Thread.sleep(THROTTLE_MS) // Nominatim: no more than ~1 request/sec
            val coords = parseCoords(
                nominatim.search(
                    query = query, userAgent = userAgent,
                    format = "jsonv2", limit = 1, countryCodes = "ru", language = "ru",
                ).firstOrNull(),
            )
            if (coords != null) return coords
        }
        return null
    }

    companion object {
        /** Pause between variants of one address — holds about one request per second. */
        private const val THROTTLE_MS = 1100L

        /**
         * A bare-city placeholder ("Moscow") is how the PWA marks a bike left off a named station.
         * It must not be geocoded: Nominatim returns the city centroid, which would then mask the
         * exact GPS in [BikeRideService.toView]. Detected as one word with no digits or commas.
         */
        fun isCityPlaceholder(raw: String): Boolean {
            val trimmed = raw.trim()
            return trimmed.isNotEmpty() && trimmed.none { it.isWhitespace() || it == ',' || it.isDigit() }
        }

        /**
         * Query candidates from precise to coarse: drop the parenthesised qualifier and the house
         * marker, then street+house-with-block, street+house, street, each with the city. Moscow
         * forms like "22k1" match poorly whole, and the coarse variants land a pin nearby.
         */
        fun candidates(raw: String): List<String> {
            val noParen = raw.replace(Regex("""\s*\([^)]*\)"""), "").trim()
            // Strip the house marker before the number. \b is no use (it fails before Cyrillic in
            // Java regex), so anchor on space/comma left and a digit right, sparing similar words.
            val noMarker = noParen.replace(Regex("""(?<=[\s,])д\.\s*(?=\d)"""), "").trim()
            val noCorpus = noMarker
                .replace(Regex("""\s*(стр|корп|соор)\.?\s*\d+""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""(\d+)\s*к\s*\d+"""), "$1") // a building's block suffix is dropped
                .trim()
            val streetOnly = noCorpus.substringBefore(",").trim()
            return listOf(noMarker, noCorpus, streetOnly)
                .map { it.trim().trimEnd(',').trim() }
                .filter { it.isNotBlank() }
                .distinct()
                .map { "$it, Москва" }
        }

        /** First Nominatim result to a (lat, lon) pair; both arrive as strings. null when absent. */
        fun parseCoords(result: NominatimResult?): Pair<Double, Double>? {
            val lat = result?.lat?.toDoubleOrNull() ?: return null
            val lon = result.lon?.toDoubleOrNull() ?: return null
            return lat to lon
        }
    }
}
