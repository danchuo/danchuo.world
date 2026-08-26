package world.danchuo.bike

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
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
    private val tariffs: BikeTariffRepository,
    private val stations: BikeStationRepository,
    private val clock: Clock,
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
     * Идемпотентно записать покупки тарифов (страница `purchases/history`). Из смешанной истории
     * берём только `TARIFF` (см. [TariffMapper.isTariffPurchase]) — `RENTAL` это списания за
     * поездки, уже есть в истории поездок. Идемпотентность — по id платежа. Покупка «Доступа» — это
     * вход в тариф (платный старт или пакет минут), без неё цена поездки неполная ([TariffAttribution]).
     */
    @Transactional
    fun upsertTariffs(items: List<PurchaseItem>): UpsertResult {
        var created = 0
        var updated = 0
        for (item in items) {
            if (!TariffMapper.isTariffPurchase(item)) continue
            val existing = tariffs.byExternalId(item.idPurchase.toString())
            val tariff = existing ?: BikeTariff().apply { createdAt = Instant.now(clock) }
            TariffMapper.applyTo(tariff, item)
            tariff.updatedAt = Instant.now(clock)
            if (existing == null) {
                tariffs.persist(tariff)
                created++
            } else {
                updated++
            }
        }
        return UpsertResult(created, updated)
    }

    /**
     * Публичная лента: поездки **текущего календарного года** (MSK), новые сверху. Велосезон
     * жмётся к лету, поэтому осью выдачи выбран год, а не число последних. Если в этом году ещё
     * ни одной поездки (зима/начало года) — показываем **одну** самую свежую (последняя прошлого
     * сезона), чтобы тайл не пустовал. Хранятся все запушенные; пусто до первого ingest — штатно.
     *
     * Деньги в проекции раскладываются [TariffAttribution]: купленный ради поездки «Доступ» +
     * то, что натикало сверх него, — цена поездки не сводится к одной лишь `cost`.
     */
    fun publicList(): List<RideView> {
        val startOfYear = LocalDate.now(clock).withDayOfYear(1)
        val thisYear = rides.listFrom(startOfYear)
        val chosen = thisYear.ifEmpty { listOfNotNull(rides.latest()) }
        // Деньги считаем по ВСЕЙ истории, а не по видимому куску: доступ мог купить сосед по пакету,
        // оставшийся за границей года, — иначе поездка присвоила бы себе чужую покупку.
        val money = TariffAttribution.attribute(rides.listOrderedDesc(), tariffs.listOrderedDesc())
        // Координаты станций по адресу — рисуем пины по станции вместо сырого GPS (заброс в Шереметьево).
        val stationCoords = stations.foundCoords()
        return chosen.map { toView(it, money, stationCoords) }
    }


    /**
     * Сводка за текущий календарный месяц (MSK) для шапки модалки поездок. Считает число поездок и
     * суммарные минуты по поездкам этого месяца, а деньги — как **реально уплаченные за месяц**:
     * платные поездки (`cost > 0`) плюс покупки тарифов ([BikeTariff]), сделанные в этом месяце, —
     * каждая покупка учтена один раз (ground truth), поэтому бесплатные поездки «в рамках тарифа»
     * не задваивают сумму (см. [RideMonthSummaryView]). Нет поездок в месяце ⇒ `rides == 0`.
     */
    fun monthSummary(): RideMonthSummaryView {
        val zone = clock.zone
        val monthStart = LocalDate.now(clock).withDayOfMonth(1)
        val nextMonthStart = monthStart.plusMonths(1)
        val monthRides = rides.listFrom(monthStart).filter { it.rideDate.isBefore(nextMonthStart) }
        // Деньги = прямые списания за платные поездки + покупки тарифов-пакетов этого месяца (по одной
        // за реальную запись о покупке — так 4 бесплатные поездки под одним пакетом не дают 4×399).
        val paidKopecks = monthRides.sumOf { (it.costKopecks ?: 0).coerceAtLeast(0).toLong() }
        val tariffKopecks = tariffs.listOrderedDesc()
            .filter { it.purchasedAt.atZone(zone).toLocalDate().let { d -> !d.isBefore(monthStart) && d.isBefore(nextMonthStart) } }
            .sumOf { it.priceKopecks.toLong() }
        return RideMonthSummaryView(
            month = monthStart.toString().substring(0, 7),
            rides = monthRides.size,
            durationSeconds = monthRides.sumOf { it.durationSeconds.toLong() },
            spentKopecks = paidKopecks + tariffKopecks,
        )
    }

    /** Агрегат истории для тайла-сводки — по ВСЕЙ истории (не только по видимому текущему году). */
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

    private fun toView(
        r: Ride,
        money: Map<Long, RideMoney>,
        stationCoords: Map<String, Pair<Double, Double>>,
    ): RideView {
        // Точка станции (по адресу) надёжнее сырого GPS велосипеда — предпочитаем её, GPS = фолбэк.
        val start = r.startAddress?.let { stationCoords[it] }
        val finish = r.finishAddress?.let { stationCoords[it] }
        val paid = money[r.externalId] ?: RideMoney(null, null)
        val access = paid.accessKopecks
        return RideView(
            id = r.id!!,
            rideDate = r.rideDate.toString(),
            startTime = ISO.format(r.startTime),
            finishTime = ISO.format(r.finishTime),
            distanceMeters = r.distanceMeters,
            durationSeconds = r.durationSeconds,
            calories = r.calories,
            costKopecks = r.costKopecks,
            accessKopecks = access,
            coveredByTariffKopecks = paid.coveredByTariffKopecks,
            totalKopecks = if (access == null && r.costKopecks == null) null else (access ?: 0) + (r.costKopecks ?: 0),
            vehicleType = r.vehicleType,
            tariffName = r.tariffName,
            startLat = start?.first ?: r.startLat,
            startLon = start?.second ?: r.startLon,
            finishLat = finish?.first ?: r.finishLat,
            finishLon = finish?.second ?: r.finishLon,
            startAddress = r.startAddress,
            finishAddress = r.finishAddress,
        )
    }

    private companion object {
        val ISO: DateTimeFormatter = DateTimeFormatter.ISO_INSTANT
    }
}
