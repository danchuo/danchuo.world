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
 * Фоновый геокодер станций (PRD §9 B4 — исправление точек поездки). Карта рисует пины по сырому
 * GPS велосипеда, который в Москве часто «улетает» (Шереметьево); адрес станции надёжный, но её
 * координат Велобайк не отдаёт. Поэтому надёжный адрес геокодим (OSM Nominatim) и кэшируем в
 * [BikeStation]; лента затем предпочитает координаты станции сырому GPS ([BikeRideService]).
 *
 * Работает **фоном по одному адресу за тик** ([Scheduled], интервал в конфиге) — так укладываемся
 * в usage policy публичного Nominatim (не чаще ~1 запроса/сек) и не блокируем приём. Уникальный
 * адрес геокодится **один раз** (результат, включая «не найдено», пишется в кэш — повторно не
 * дёргаем). Любой сбой геокодера деградирует тихо: без матча точка остаётся на GPS-фолбэке.
 *
 * Московские адреса с корпус/строение/буквенным домом («д. 22к1», «д. 18А стр. 1») Nominatim берёт
 * плохо, поэтому пробуем несколько [candidates] по убыванию точности (с корпусом → без → только
 * улица) — первый удачный побеждает. Пин по улице стоит рядом (метры), но это несравнимо точнее
 * заброса GPS в Шереметьево.
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
     * Один тик: взять адрес поездки, ещё не пробованный геокодером, и записать его в кэш (координаты
     * или «не найдено»). Сетевой сбой ⇒ выходим без записи (ретрай на следующем тике); все варианты
     * пусты ⇒ пишем `found = false`, чтобы не долбить повторно.
     */
    @Transactional
    @Scheduled(every = "{danchuo.bike.geocode.interval}", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    fun tick() {
        if (!enabled) return
        val known = stations.knownAddresses()
        val address = rides.distinctAddresses().firstOrNull { it !in known } ?: return

        val coords = try {
            // Заглушку «просто город» не геокодим: центроид перекрыл бы точный GPS (см. isCityPlaceholder).
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

    /** Пробуем варианты запроса по убыванию точности; первый непустой матч побеждает. */
    private fun geocode(address: String): Pair<Double, Double>? {
        for ((i, query) in candidates(address).withIndex()) {
            if (i > 0) Thread.sleep(THROTTLE_MS) // Nominatim: не чаще ~1 запроса/сек
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
        /** Пауза между вариантами одного адреса — держим ~1 запрос/сек к Nominatim. */
        private const val THROTTLE_MS = 1100L

        /**
         * Адрес-заглушка «просто город» («Москва») — так PWA помечает велосипед, оставленный вне
         * именованной станции. Геокодить нельзя: Nominatim отдаст центроид города (Красная площадь),
         * а он в [BikeRideService.toView] перекроет точный GPS. Признак: одно слово без цифр/запятых.
         */
        fun isCityPlaceholder(raw: String): Boolean {
            val trimmed = raw.trim()
            return trimmed.isNotEmpty() && trimmed.none { it.isWhitespace() || it == ',' || it.isDigit() }
        }

        /**
         * Кандидаты-запросы для адреса, от точного к грубому: убираем уточнение в скобках и маркер
         * дома «д.», затем варианты «улица дом-с-корпусом» → «улица дом» → «улица», каждый с городом.
         * Московские «22к1»/«18А стр. 1» плохо матчатся целиком — грубые варианты дают пин рядом.
         */
        fun candidates(raw: String): List<String> {
            val noParen = raw.replace(Regex("""\s*\([^)]*\)"""), "").trim()
            // Срезаем маркер дома «д.» перед номером. \b не годится (не работает перед кириллицей в
            // Java-regex), поэтому якоримся на пробел/запятую слева и цифру справа — «пр-д.» не заденет.
            val noMarker = noParen.replace(Regex("""(?<=[\s,])д\.\s*(?=\d)"""), "").trim()
            val noCorpus = noMarker
                .replace(Regex("""\s*(стр|корп|соор)\.?\s*\d+""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""(\d+)\s*к\s*\d+"""), "$1") // «22к1» → «22»
                .trim()
            val streetOnly = noCorpus.substringBefore(",").trim()
            return listOf(noMarker, noCorpus, streetOnly)
                .map { it.trim().trimEnd(',').trim() }
                .filter { it.isNotBlank() }
                .distinct()
                .map { "$it, Москва" }
        }

        /** Первый результат Nominatim → пара (lat, lon); `lat`/`lon` там строки. null, если нет/битый. */
        fun parseCoords(result: NominatimResult?): Pair<Double, Double>? {
            val lat = result?.lat?.toDoubleOrNull() ?: return null
            val lon = result.lon?.toDoubleOrNull() ?: return null
            return lat to lon
        }
    }
}
