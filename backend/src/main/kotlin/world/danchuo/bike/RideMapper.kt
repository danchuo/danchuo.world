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
