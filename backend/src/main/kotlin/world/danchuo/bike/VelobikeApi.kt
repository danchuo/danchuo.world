package world.danchuo.bike

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * Сырые DTO внешнего API Велобайка (`pwa.velobike.ru`) — зеркало ответов, восстановленных
 * реверс-инжинирингом мобильного приложения. Только нужные поля; остальное игнорируем
 * ([JsonIgnoreProperties] — контракт чужой и может прирастать, не должен ронять парсинг).
 *
 * Живут в слайсе `bike`: маппинг в доменную [Ride] — в [BikeRideService], дальше по системе
 * ходит уже наша модель, а не форма Велобайка.
 */

/** Страница истории: `GET /api/rent/rents/client?size=&page=&statuses=TECH_DONE,DONE` (Spring Data Page). */
@JsonIgnoreProperties(ignoreUnknown = true)
data class RentPage(
    val content: List<RentItem> = emptyList(),
    val totalElements: Int = 0,
    val totalPages: Int = 0,
    val number: Int = 0,
    val last: Boolean = true,
)

/** Одна поездка из истории. Времена — epoch millis; `distance` — метры (float); `cost` — копейки. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class RentItem(
    val id: Long,
    val status: String? = null,
    val startTime: Long? = null,
    val finishTime: Long? = null,
    val distance: Double? = null,
    val duration: Int? = null,
    val calories: Int? = null,
    val cost: Int? = null,
    val vehicleType: String? = null,
    val frameNumber: String? = null,
    val tariffName: String? = null,
    val startBikeGeoPosition: GeoPosition? = null,
    val finishBikeGeoPosition: GeoPosition? = null,
    // Только из детального getPopulatedRent:
    val startParkingAddress: String? = null,
    val finishParkingAddress: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class GeoPosition(
    val lat: Double? = null,
    val lon: Double? = null,
)

/**
 * Страница истории покупок: `GET /api/purchases/history?size=&page=` (Spring Data Page). Смешивает
 * записи двух видов по [PurchaseItem.purchaseType]: `TARIFF` (покупка тарифа — нужна нам для
 * атрибуции бесплатных поездок) и `RENTAL` (списание за конкретную поездку — это у нас уже есть).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PurchasePage(
    val content: List<PurchaseItem> = emptyList(),
    val totalElements: Int = 0,
    val number: Int = 0,
    val last: Boolean = true,
)

/**
 * Одна запись истории покупок. `cost` — копейки (напр. `39900` = 399 ₽ за «Пакет 60 минут»);
 * `createDate` — epoch millis момента покупки. Название/минуты берём из [orderItems].
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PurchaseItem(
    val idPurchase: Long,
    val purchaseType: String? = null,
    val cost: Int? = null,
    val createDate: Long? = null,
    val orderItems: List<PurchaseOrderItem> = emptyList(),
)

/** Позиция покупки: `type` = `tariff`/`rental`, `name` — человекочитаемое («Доступ Пакет 60 минут»). */
@JsonIgnoreProperties(ignoreUnknown = true)
data class PurchaseOrderItem(
    val type: String? = null,
    val name: String? = null,
    val cost: Int? = null,
)

/**
 * Ответ `POST /api/api-auth/client-authenticate` (тело `{user: телефон, password: код из SMS}`).
 * `access_token` — JWT на 24ч; `refresh_token` — JWT на ~6 мес (хранится шифрованно); supabase-
 * токен слайсу не нужен (отдельный бэкенд).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class VelobikeAuthResponse(
    val access_token: String? = null,
    val refresh_token: String? = null,
)

/** Ответ `POST /api/api-auth/code/{phone}` — запрос SMS-кода. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class VelobikeCodeResponse(
    val authParameters: CodeParams? = null,
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    data class CodeParams(val expiresIn: Int? = null, val length: Int? = null, val retriesIn: Int? = null)
}
