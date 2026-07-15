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

/**
 * Привязка бесплатной поездки к тарифу, «покрывающему» её (PRD §9 B4). Чистая логика (без БД),
 * чтобы покрываться юнит-тестом. `cost = 0` — поездка едет не «бесплатно», а в рамках ранее
 * купленного пакета минут; берём **ближайшую предшествующую** покупку по времени
 * (`purchasedAt <= rideStart`) и её цену. Платная поездка (`cost != 0`), либо покупок раньше не
 * было, либо цена покупки нулевая ⇒ `null` (фронт покажет обычную стоимость/«бесплатно»).
 */
object TariffAttribution {

    /** [purchases] — покупки тарифов, отсортированные по времени убыванием (первая подходящая = ближайшая). */
    fun coveringKopecks(costKopecks: Int?, rideStart: Instant, purchases: List<BikeTariff>): Int? {
        if (costKopecks != 0) return null
        val covering = purchases.firstOrNull { !it.purchasedAt.isAfter(rideStart) } ?: return null
        return covering.priceKopecks.takeIf { it > 0 }
    }
}
