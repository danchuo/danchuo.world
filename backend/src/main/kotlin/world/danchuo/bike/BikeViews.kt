package world.danchuo.bike

/**
 * Публичные проекции слайса bike (PRD §9 B4). Всё на чтение, без токена (§3). Наружу отдаём
 * нашу модель, а не сырьё Велобайка ([VelobikeApi]).
 */

/**
 * Одна поездка для ленты/дневного слоя борда. Времена — ISO-8601, дата — MSK (`ride_date`).
 * Координаты — только старт и финиш (трека маршрута API не отдаёт): фронт рисует 2 пина на мини-карте.
 */
data class RideView(
    val id: Long,
    val rideDate: String,
    val startTime: String,
    val finishTime: String,
    val distanceMeters: Int,
    val durationSeconds: Int,
    val calories: Int?,
    /** Стоимость поездки в копейках (`cost` API; null — нет данных). Формат — на фронте. */
    val costKopecks: Int?,
    /**
     * Для бесплатной поездки (`costKopecks == 0`) — цена (копейки) ближайшего предшествующего
     * купленного тарифа, «покрывающего» её. Позволяет фронту показать «в рамках тарифа за N ₽»
     * вместо «бесплатно». null, если поездка платная или подходящей покупки в истории нет.
     */
    val coveredByTariffKopecks: Int?,
    val vehicleType: String?,
    val tariffName: String?,
    val startLat: Double?,
    val startLon: Double?,
    val finishLat: Double?,
    val finishLon: Double?,
    val startAddress: String?,
    val finishAddress: String?,
)

/**
 * Агрегат истории поездок — для тайла-сводки («сколько накатал»). Все суммы по сохранённым
 * поездкам; пусто (нулевой агрегат) — штатное состояние до первого ingest, не ошибка.
 */
data class RideStatsView(
    val totalRides: Int,
    val totalDistanceMeters: Long,
    val totalDurationSeconds: Long,
    val totalCalories: Long,
    val longestRideMeters: Int,
    val firstRideDate: String?,
    val lastRideDate: String?,
)

/**
 * Сводка за **текущий календарный месяц** (MSK) для шапки модалки поездок: сколько раз проехал,
 * сколько минут суммарно и сколько денег ушло. `rides == 0` — в этом месяце поездок нет (фронт
 * не рисует строку).
 *
 * `spentKopecks` — **фактически уплаченные деньги за месяц**, а не сумма стоимостей поездок: это
 * платные поездки (`cost > 0`, прямое списание) **плюс** покупки тарифов-пакетов, сделанные в этом
 * месяце ([BikeTariff], каждая учтена ровно один раз). Так деньги не задваиваются: четыре
 * бесплатные поездки «в рамках тарифа за 399 ₽» — это ровно те 399 ₽ (или 2×399, если пакетов
 * куплено два) из реальных записей о покупках, а не 4×399 из строк поездок.
 */
data class RideMonthSummaryView(
    /** Месяц сводки в формате `YYYY-MM` (MSK) — для подписи/отладки. */
    val month: String,
    val rides: Int,
    val durationSeconds: Long,
    val spentKopecks: Long,
)
