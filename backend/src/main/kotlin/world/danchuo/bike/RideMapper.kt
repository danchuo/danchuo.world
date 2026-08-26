package world.danchuo.bike

import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt

/**
 * Чистый маппинг сырья внешнего API ([RentItem]) в доменную [Ride] — без БД/времени, чтобы
 * покрываться юнит-тестом на реальной фикстуре. Времена API — epoch millis; `distance` — метры
 * (float→int); `cost` — копейки. [rideDate] считается в каноне MSK по [zone] (§4).
 *
 * Адреса станций приходят только из детального `getPopulatedRent`, поэтому ставим их **лишь когда
 * не null** — иначе обновление из списка затёрло бы уже сохранённый адрес.
 */
object RideMapper {

    /** Перенести поля [item] в [ride] (старт/финиш уже извлечены и провалидированы вызывающим). */
    fun applyTo(ride: Ride, item: RentItem, start: Instant, finish: Instant, zone: ZoneId) {
        ride.externalId = item.id
        ride.startTime = start
        ride.finishTime = finish
        ride.rideDate = start.atZone(zone).toLocalDate()
        ride.distanceMeters = item.distance?.roundToInt() ?: 0
        ride.durationSeconds = item.duration ?: 0
        ride.calories = item.calories
        ride.costKopecks = item.cost
        ride.vehicleType = item.vehicleType
        ride.frameNumber = item.frameNumber
        ride.tariffName = item.tariffName
        ride.startLat = item.startBikeGeoPosition?.lat
        ride.startLon = item.startBikeGeoPosition?.lon
        ride.finishLat = item.finishBikeGeoPosition?.lat
        ride.finishLon = item.finishBikeGeoPosition?.lon
        item.startParkingAddress?.let { ride.startAddress = it }
        item.finishParkingAddress?.let { ride.finishAddress = it }
    }
}

/**
 * Чистый маппинг записи истории покупок ([PurchaseItem]) в [BikeTariff] — без БД/времени, под
 * юнит-тест на реальной фикстуре. Храним только **покупки тарифов** (`purchaseType == TARIFF`):
 * записи `RENTAL` — это списания за поездки, они у нас уже есть в истории поездок.
 *
 * `cost` — копейки (как у поездок); минуты пакета вытягиваем из названия («…60 минут» → 60), это
 * best-effort и для отображения не требуется (там нужна только цена покупки).
 */
object TariffMapper {

    /** Годна к хранению только покупка тарифа с временем покупки (иначе её нельзя привязать по оси времени). */
    fun isTariffPurchase(item: PurchaseItem): Boolean =
        item.purchaseType.equals("TARIFF", ignoreCase = true) && item.createDate != null

    /** Перенести поля [item] в [tariff] (вызывающий уже проверил [isTariffPurchase]). */
    fun applyTo(tariff: BikeTariff, item: PurchaseItem) {
        val orderItem = item.orderItems.firstOrNull { it.type.equals("tariff", ignoreCase = true) }
            ?: item.orderItems.firstOrNull()
        tariff.externalId = item.idPurchase.toString()
        tariff.purchasedAt = Instant.ofEpochMilli(item.createDate!!)
        tariff.priceKopecks = item.cost ?: orderItem?.cost ?: 0
        tariff.name = orderItem?.name
        tariff.minutes = orderItem?.name?.let(::parseMinutes)
    }

    /** «Доступ Пакет 60 минут» → 60; «Доступ Поминутный» → null. Диагностика/будущее. */
    private fun parseMinutes(name: String): Int? =
        Regex("""(\d+)\s*мин""").find(name)?.groupValues?.get(1)?.toIntOrNull()
}

/** Деньги одной поездки: доступ, купленный ради неё, и цена пакета, под которым она едет. */
data class RideMoney(
    /** Цена «Доступа», купленного ради этой поездки (копейки), или null — доступ куплен не ею. */
    val accessKopecks: Int?,
    /** Цена пакета, под которым едет поездка, не купившая доступ сама (копейки), или null. */
    val coveredByTariffKopecks: Int?,
)

/**
 * Кто за какую поездку заплатил (PRD §9 B4). Велобайк берёт деньги **двумя** записями, и обе нужны,
 * чтобы цена поездки не врала:
 *  - **«Доступ …»** ([BikeTariff]) — вход в тариф: «Доступ Поминутный» (платный старт, 40 ₽) или
 *    «Доступ Пакет 60 минут» (399 ₽ за час). Покупается за считанные секунды до старта поездки.
 *  - **`cost` самой поездки** — то, что натикало **сверх** доступа: минуты поминутного тарифа либо
 *    превышение пакета (7,49 ₽/мин на замерах истории).
 *
 * Отсюда две привязки. **Доступ** достаётся ровно одной поездке — той, ради которой куплен: первой
 * по времени поездке того же тарифа ([Ride.tariffName] = имя покупки без слова «Доступ»), стартующей
 * после покупки, до следующей покупки и не позже [OWN_WINDOW_SECONDS]. **Покрытие** — для остальных
 * поездок под уже оплаченным пакетом: ближайшая предшествующая покупка того же тарифа не старше
 * [COVER_WINDOW_SECONDS]; это только пояснение к строке — деньги за неё уже посчитаны у поездки,
 * купившей доступ, второй раз их не берём.
 *
 * Пакет живёт, пока не выкатаны его минуты (сроком не ограничиваем — на истории покупок видно, что
 * один «Пакет 60 минут» покрывает поездки и через сутки с лишним, а новый покупается ровно тогда,
 * когда минуты кончились). Поминутный доступ, наоборот, не покрывает никого: включённых минут в нём
 * нет, он открывает ровно одну поездку. Купленный и не откатанный доступ не липнет ни к какой
 * поездке — он просто потраченные деньги месяца ([BikeRideService.monthSummary]).
 */
object TariffAttribution {

    /** Насколько поздно после покупки может стартовать поездка, ради которой доступ куплен. */
    private const val OWN_WINDOW_SECONDS = 24L * 3600

    /** Насколько старой может быть покупка, «покрывающая» поездку без своего доступа. */
    private const val COVER_WINDOW_SECONDS = 7L * 24 * 3600

    /** Часы покупки могут отстать от часов аренды — небольшой запас в обратную сторону. */
    private const val CLOCK_GRACE_SECONDS = 120L

    /**
     * Разложить деньги по поездкам: `externalId` поездки → [RideMoney]. Порядок входных списков не
     * важен. Поездка, к которой покупок не нашлось (история до появления `bike_tariff`), получает
     * пустой [RideMoney] — витрина покажет её как раньше, по одной лишь `cost`.
     */
    fun attribute(rides: List<Ride>, purchases: List<BikeTariff>): Map<Long, RideMoney> {
        val byStart = rides.sortedBy { it.startTime }
        val buys = purchases.sortedBy { it.purchasedAt }
        val accessOf = HashMap<Long, Int>()
        val taken = HashSet<Long>()

        for ((i, buy) in buys.withIndex()) {
            val kind = tariffKind(buy.name) ?: continue
            val nextBuy = buys.getOrNull(i + 1)?.purchasedAt
            val owner = byStart.firstOrNull { ride ->
                ride.externalId !in taken &&
                    matches(ride.tariffName, kind) &&
                    opensRide(buy.purchasedAt, ride.startTime, nextBuy)
            } ?: continue
            taken += owner.externalId
            if (buy.priceKopecks > 0) accessOf[owner.externalId] = buy.priceKopecks
        }

        return byStart.associate { ride ->
            val access = accessOf[ride.externalId]
            val covered = if (ride.externalId in taken) null else covering(ride, buys)
            ride.externalId to RideMoney(access, covered)
        }
    }

    /** «Доступ Пакет 60 минут» → «пакет 60 минут»; без слова «Доступ» покупку опознать нельзя. */
    private fun tariffKind(purchaseName: String?): String? {
        val clean = normalize(purchaseName) ?: return null
        if (!clean.startsWith("доступ")) return null
        return clean.removePrefix("доступ").trim().takeIf { it.isNotEmpty() }
    }

    private fun normalize(name: String?): String? =
        name?.replace(Regex("""\s+"""), " ")?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

    private fun matches(rideTariffName: String?, kind: String): Boolean = normalize(rideTariffName) == kind

    /** Поминутный доступ включённых минут не несёт — покрывать им следующие поездки нечем. */
    private fun isPerMinute(kind: String): Boolean = kind.startsWith("поминутн")

    /** Доступ открывает поездку, если она стартует сразу за покупкой и до следующей покупки. */
    private fun opensRide(purchasedAt: Instant, rideStart: Instant, nextBuy: Instant?): Boolean {
        val delta = rideStart.epochSecond - purchasedAt.epochSecond
        if (delta < -CLOCK_GRACE_SECONDS || delta > OWN_WINDOW_SECONDS) return false
        return nextBuy == null || rideStart.isBefore(nextBuy)
    }

    /** Ближайшая предшествующая покупка того же тарифа-пакета — под ним поездка и едет. */
    private fun covering(ride: Ride, buysAsc: List<BikeTariff>): Int? =
        buysAsc.lastOrNull { buy ->
            val kind = tariffKind(buy.name)
            if (kind == null || isPerMinute(kind)) return@lastOrNull false
            val age = ride.startTime.epochSecond - buy.purchasedAt.epochSecond
            age in 0..COVER_WINDOW_SECONDS && matches(ride.tariffName, kind)
        }?.priceKopecks?.takeIf { it > 0 }
}
