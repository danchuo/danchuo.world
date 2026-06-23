package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * Одна поездка на Велобайке (PRD §9 B4, ось данных — дата старта в MSK, §4).
 *
 * Источник — внешний API `pwa.velobike.ru` (`/api/rent/rents/client`), реверс-инжиниринг
 * мобильного приложения. Слайс `bike` целиком изолирует этот источник: ядро о нём не знает
 * (как Spotify, §3.1). Поездки **идемпотентны** по [externalId] — id аренды в системе
 * Велобайка; повторный приём той же поездки обновляет строку, а не плодит дубли (как ingest
 * дня по дате, §5.4). Канал доставки развязан с моделью: и фоновый поллер ([VelobikePoller]),
 * и ручной push-ingest пишут через [BikeRideService.upsert] — выбор канала не меняет схему.
 *
 * [rideDate] — дата старта в MSK (UTC+3), чтобы поездка садилась на тот же день, что и
 * остальная статистика (сон/шаги/дисциплина) для дневного слоя борда.
 */
@Entity
@Table(name = "bike_ride")
class Ride {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Id аренды в системе Велобайка — ключ идемпотентности (upsert по нему). */
    @Column(name = "external_id", nullable = false, unique = true)
    var externalId: Long = 0

    /** Дата старта в MSK (ось данных, §4) — поездка относится к этому дню борда. */
    @Column(name = "ride_date", nullable = false)
    lateinit var rideDate: LocalDate

    @Column(name = "start_time", nullable = false)
    lateinit var startTime: Instant

    @Column(name = "finish_time", nullable = false)
    lateinit var finishTime: Instant

    /** Дистанция в метрах (API отдаёт float, храним целым). */
    @Column(name = "distance_meters", nullable = false)
    var distanceMeters: Int = 0

    @Column(name = "duration_seconds", nullable = false)
    var durationSeconds: Int = 0

    /** Сожжённые калории (по оценке Велобайка); может отсутствовать. */
    @Column(name = "calories")
    var calories: Int? = null

    /** Стоимость в копейках (`cost` API; 0 — бесплатно по тарифу). */
    @Column(name = "cost_kopecks")
    var costKopecks: Int? = null

    /** Тип ТС: `OMNI_24`/`OMNI_23`/`OMNI_MECHANICAL`… — механика vs электро. */
    @Column(name = "vehicle_type")
    var vehicleType: String? = null

    /** Номер рамы велосипеда (диагностика/курьёз). */
    @Column(name = "frame_number")
    var frameNumber: String? = null

    /** Название тарифа (`tariffName`), как отдаёт API (кириллица). */
    @Column(name = "tariff_name")
    var tariffName: String? = null

    @Column(name = "start_lat")
    var startLat: Double? = null

    @Column(name = "start_lon")
    var startLon: Double? = null

    @Column(name = "finish_lat")
    var finishLat: Double? = null

    @Column(name = "finish_lon")
    var finishLon: Double? = null

    /** Адреса станций старта/финиша — приходят только из детального `getPopulatedRent`. */
    @Column(name = "start_address")
    var startAddress: String? = null

    @Column(name = "finish_address")
    var finishAddress: String? = null

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant
}
