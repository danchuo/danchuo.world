package world.danchuo.bike

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId

/**
 * Контракт внешнего API Велобайка зафиксирован на **реальной** фикстуре (анонимизированный
 * ответ `/api/rent/rents/client`, снят реверсом). Проверяем парсинг страницы и чистый маппинг
 * [RideMapper] — без БД и Quarkus-контекста (быстрый юнит).
 */
class VelobikeMappingTest {

    private val mapper = ObjectMapper().registerKotlinModule()
    private val msk = ZoneId.of("Europe/Moscow")

    private fun loadPage(): RentPage {
        val json = javaClass.getResourceAsStream("/fixtures/velobike-rents-page.json")!!
            .readBytes().toString(Charsets.UTF_8)
        return mapper.readValue(json, RentPage::class.java)
    }

    @Test
    fun `парсит страницу истории и пагинацию`() {
        val page = loadPage()
        assertEquals(10, page.content.size)
        assertEquals(76, page.totalElements) // всего поездок на аккаунте
        assertEquals(0, page.number)

        val first = page.content.first()
        assertEquals(8476789L, first.id)
        assertEquals("DONE", first.status)
        assertEquals(5000.0, first.distance)
        assertEquals(1798, first.duration)
        assertEquals(120, first.calories)
        assertEquals("OMNI_24", first.vehicleType)
        assertEquals(55.7304775, first.startBikeGeoPosition?.lat)
    }

    @Test
    fun `маппит поездку в доменную модель, дата старта — в MSK`() {
        val item = loadPage().content.first()
        val ride = Ride()
        RideMapper.applyTo(
            ride, item,
            Instant.ofEpochMilli(item.startTime!!),
            Instant.ofEpochMilli(item.finishTime!!),
            msk,
        )
        assertEquals(8476789L, ride.externalId)
        assertEquals("2026-06-21", ride.rideDate.toString()) // 10:39 UTC → 13:39 MSK, тот же день
        assertEquals(5000, ride.distanceMeters)
        assertEquals(1798, ride.durationSeconds)
        assertEquals(120, ride.calories)
        assertEquals(0, ride.costKopecks)
        assertEquals("OMNI_24", ride.vehicleType)
        assertEquals(55.7304775, ride.startLat)
    }

    @Test
    fun `вся выборка фикстуры маппится без потерь и с валидными полями`() {
        val rides = loadPage().content.map { item ->
            Ride().also {
                RideMapper.applyTo(
                    it, item,
                    Instant.ofEpochMilli(item.startTime!!),
                    Instant.ofEpochMilli(item.finishTime!!),
                    msk,
                )
            }
        }
        assertEquals(10, rides.size)
        assertTrue(rides.all { it.distanceMeters >= 0 && it.durationSeconds >= 0 })
        assertTrue(rides.all { it.finishTime.isAfter(it.startTime) || it.finishTime == it.startTime })
        // Стоимость (`cost` копейки) маппится у всех и включает платные поездки (не только 0).
        assertTrue(rides.all { (it.costKopecks ?: -1) >= 0 })
        assertTrue(rides.any { (it.costKopecks ?: 0) > 0 })
    }

    @Test
    fun `обновление из списка не затирает уже сохранённый адрес станции`() {
        // Список (rents/client) адресов не несёт; адрес приходит только из getPopulatedRent.
        val item = loadPage().content.first()
        assertNull(item.startParkingAddress)
        val ride = Ride().apply { startAddress = "Кутузовский пр-т, д. 41" }
        RideMapper.applyTo(
            ride, item,
            Instant.ofEpochMilli(item.startTime!!),
            Instant.ofEpochMilli(item.finishTime!!),
            msk,
        )
        assertEquals("Кутузовский пр-т, д. 41", ride.startAddress) // сохранён, не затёрт null'ом
    }
}
