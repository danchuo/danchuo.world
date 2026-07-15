package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Кэш координат станции-парковки Велобайка по её адресу (PRD §9 B4 — исправление точек поездки).
 *
 * Зачем: карта поездки рисует пины по **сырому GPS велосипеда** (`*BikeGeoPosition`), который в
 * Москве регулярно «улетает» (частый заброс в Шереметьево). Адрес станции при этом надёжный
 * (приходит из `getPopulatedRent`), но координат станции Велобайк наружу не отдаёт (API парковок —
 * `403` для роли CLIENT). Поэтому надёжный адрес **геокодим** (OSM Nominatim) в координаты один раз
 * на адрес и кэшируем здесь; карта затем рисует по станции, а GPS остаётся фолбэком (см.
 * [StationGeocoder] и [BikeRideService.publicList]).
 *
 * Одна строка на уникальный адрес. [found] = удалось ли геокодировать: `false` помечает, что адрес
 * уже пробовали и матча нет — чтобы не долбить геокодер повторно. Идемпотентность — по [address].
 */
@Entity
@Table(name = "bike_station")
class BikeStation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Адрес станции как пришёл от Велобайка (ключ кэша) — напр. «метро Кунцевская (Арбатско-Покровская)». */
    @Column(name = "address", nullable = false, unique = true)
    lateinit var address: String

    /** Координаты станции (из геокодера); null, если [found] = false. */
    @Column(name = "lat")
    var lat: Double? = null

    @Column(name = "lon")
    var lon: Double? = null

    /** Удалось ли геокодировать адрес. false ⇒ уже пробовали, матча нет (не ретраим). */
    @Column(name = "found", nullable = false)
    var found: Boolean = false

    @Column(name = "geocoded_at", nullable = false)
    lateinit var geocodedAt: Instant
}
