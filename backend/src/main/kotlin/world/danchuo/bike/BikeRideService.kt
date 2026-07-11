package world.danchuo.bike

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.time.Clock
import java.time.Instant
import java.time.format.DateTimeFormatter

/** Итог приёма пачки поездок: сколько новых добавлено и сколько обновлено (для логов поллера/ingest). */
data class UpsertResult(val created: Int, val updated: Int)

/**
 * Доменная логика истории поездок Велобайка (PRD §9 B4). Точка, где сырьё внешнего API
 * ([RentItem]) превращается в нашу модель ([Ride]) и идемпотентно ложится в БД. Канал доставки
 * развязан: и фоновый [VelobikePoller], и ручной push-ingest зовут [upsert] — поэтому смена
 * способа доставки (поллинг ⇄ push из браузера) не трогает ни схему, ни проекции.
 *
 * Идемпотентность — по [Ride.externalId] (id аренды Велобайка): повтор той же поездки обновляет
 * строку, дубля не создаёт (как ingest дня по дате, §5.4). Адреса станций приходят только из
 * детального `getPopulatedRent`, поэтому при обновлении **не затираем** уже сохранённый адрес null'ом.
 */
@ApplicationScoped
class BikeRideService(
    private val rides: RideRepository,
    private val clock: Clock,
    private val config: VelobikeConfig,
) {

    /**
     * Идемпотентно записать пачку поездок. Незавершённые/без времён — пропускаем (в историю
     * попадают только состоявшиеся поездки). Возвращает счётчик новых/обновлённых.
     */
    @Transactional
    fun upsert(items: List<RentItem>): UpsertResult {
        var created = 0
        var updated = 0
        for (item in items) {
            val start = item.startTime ?: continue
            val finish = item.finishTime ?: continue
            val existing = rides.byExternalId(item.id)
            val ride = existing ?: Ride().apply { createdAt = Instant.now(clock) }
            RideMapper.applyTo(ride, item, Instant.ofEpochMilli(start), Instant.ofEpochMilli(finish), clock.zone)
            ride.updatedAt = Instant.now(clock)
            if (existing == null) {
                rides.persist(ride)
                created++
            } else {
                updated++
            }
        }
        return UpsertResult(created, updated)
    }

    /**
     * Публичная лента: последние [publicLimit] поездок, новые сверху. Хранятся все запушенные —
     * лимит только на выдачу (тайл/модалка показывают свежие). Пусто до первого ingest — штатно.
     */
    fun publicList(): List<RideView> = rides.listRecent(config.publicLimit()).map(::toView)

    /** Агрегат истории для тайла-сводки — по ВСЕЙ истории (не по видимым [publicLimit]). */
    fun stats(): RideStatsView {
        val all = rides.listOrderedDesc()
        if (all.isEmpty()) return RideStatsView(0, 0, 0, 0, 0, null, null)
        return RideStatsView(
            totalRides = all.size,
            totalDistanceMeters = all.sumOf { it.distanceMeters.toLong() },
            totalDurationSeconds = all.sumOf { it.durationSeconds.toLong() },
            totalCalories = all.sumOf { (it.calories ?: 0).toLong() },
            longestRideMeters = all.maxOf { it.distanceMeters },
            firstRideDate = all.minByOrNull { it.startTime }!!.rideDate.toString(),
            lastRideDate = all.maxByOrNull { it.startTime }!!.rideDate.toString(),
        )
    }

    private fun toView(r: Ride) = RideView(
        id = r.id!!,
        rideDate = r.rideDate.toString(),
        startTime = ISO.format(r.startTime),
        finishTime = ISO.format(r.finishTime),
        distanceMeters = r.distanceMeters,
        durationSeconds = r.durationSeconds,
        calories = r.calories,
        vehicleType = r.vehicleType,
        tariffName = r.tariffName,
        startLat = r.startLat,
        startLon = r.startLon,
        finishLat = r.finishLat,
        finishLon = r.finishLon,
        startAddress = r.startAddress,
        finishAddress = r.finishAddress,
    )

    private companion object {
        val ISO: DateTimeFormatter = DateTimeFormatter.ISO_INSTANT
    }
}
