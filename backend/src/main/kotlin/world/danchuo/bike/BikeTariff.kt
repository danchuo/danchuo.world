package world.danchuo.bike

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/**
 * Одна покупка тарифа/абонемента Велобайка (PRD §9 B4 — атрибуция бесплатных поездок).
 *
 * Зачем: часть поездок в истории стоит `cost = 0` — это **не** «бесплатно», а «в рамках уже
 * оплаченного тарифа на N минут» (куплен раньше, ещё не потрачен/не истёк). Чтобы честно
 * показать «в рамках тарифа за N ₽» вместо «бесплатно», рядом с поездками храним историю
 * **покупок** тарифов (страница `pwa.velobike.ru/profile/purchase-history`) и привязываем к
 * бесплатной поездке ближайшую **предшествующую** покупку по времени (см. [BikeRideService]).
 *
 * Источник — тот же внешний контур Велобайка, изолированный в слайсе `bike`; доставка — тем же
 * букмарклетом из авторизованного браузера владельца, что и поездки (серверный поллер за Qrator).
 * Покупки **идемпотентны** по [externalId] (id платежа/заказа Велобайка) — повтор обновляет строку.
 * Отдельным тайлом покупки НЕ показываются: они лишь уточняют слово «бесплатно» в истории поездок.
 */
@Entity
@Table(name = "bike_tariff")
class BikeTariff {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Id покупки в системе Велобайка — ключ идемпотентности (upsert по нему). Строка: id заказа
     *  может быть не числом; если API не даёт стабильный id, вызывающий синтезирует его из времени. */
    @Column(name = "external_id", nullable = false, unique = true)
    lateinit var externalId: String

    /** Момент покупки тарифа (ось привязки: к поездке цепляем ближайшую покупку с `purchasedAt <=` старт). */
    @Column(name = "purchased_at", nullable = false)
    lateinit var purchasedAt: Instant

    /** Уплаченная сумма в копейках (канон; конверсия из формы API — в маппере). */
    @Column(name = "price_kopecks", nullable = false)
    var priceKopecks: Int = 0

    /** Название тарифа/абонемента, как отдаёт API (кириллица), если есть. */
    @Column(name = "name")
    var name: String? = null

    /** Пакет минут тарифа, если API его отдаёт (диагностика/будущее; для отображения не нужен). */
    @Column(name = "minutes")
    var minutes: Int? = null

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant
}
