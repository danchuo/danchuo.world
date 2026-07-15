package world.danchuo.bike

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Контракт истории покупок Велобайка (`/api/purchases/history`) зафиксирован на анонимизированной
 * фикстуре. Проверяем: страница парсится; хранятся ТОЛЬКО покупки тарифов (`TARIFF`), а списания
 * за поездки (`RENTAL`) отсеиваются; поля и минуты маппятся из `orderItems`. Без БД (чистый юнит).
 */
class TariffMappingTest {

    private val mapper = ObjectMapper().registerKotlinModule()

    private fun loadPage(): PurchasePage {
        val json = javaClass.getResourceAsStream("/fixtures/velobike-purchases-page.json")!!
            .readBytes().toString(Charsets.UTF_8)
        return mapper.readValue(json, PurchasePage::class.java)
    }

    @Test
    fun `парсит страницу истории покупок`() {
        val page = loadPage()
        assertEquals(4, page.content.size)
        assertEquals(42, page.totalElements)
        assertFalse(page.last)
    }

    @Test
    fun `TARIFF — покупка тарифа, RENTAL — нет`() {
        val page = loadPage()
        val tariff = page.content.first { it.idPurchase == 2715716L }
        val rental = page.content.first { it.idPurchase == 2716277L }
        assertTrue(TariffMapper.isTariffPurchase(tariff))
        assertFalse(TariffMapper.isTariffPurchase(rental)) // списание за поездку — не храним
    }

    @Test
    fun `маппит покупку пакета — цена в копейках, минуты из названия`() {
        val item = loadPage().content.first { it.idPurchase == 2715716L }
        val tariff = BikeTariff()
        TariffMapper.applyTo(tariff, item)
        assertEquals("2715716", tariff.externalId)
        assertEquals(39900, tariff.priceKopecks) // 399 ₽
        assertEquals("Доступ Пакет 60 минут", tariff.name)
        assertEquals(60, tariff.minutes)
        assertEquals(Instant.ofEpochMilli(1783766206685), tariff.purchasedAt)
    }

    @Test
    fun `поминутный тариф — минуты не парсятся (нет пакета)`() {
        val item = loadPage().content.first { it.idPurchase == 2757350L }
        val tariff = BikeTariff()
        TariffMapper.applyTo(tariff, item)
        assertEquals(4000, tariff.priceKopecks) // 40 ₽
        assertEquals("Доступ Поминутный", tariff.name)
        assertNull(tariff.minutes)
    }

    // --- Привязка бесплатной поездки к покрывающему тарифу (TariffAttribution) ---

    private fun purchase(id: String, at: Instant, kopecks: Int) = BikeTariff().apply {
        externalId = id
        purchasedAt = at
        priceKopecks = kopecks
    }

    private val t0 = Instant.parse("2026-07-01T00:00:00Z")

    // Покупки, отсортированные по времени убыванием (как отдаёт репозиторий).
    private val purchasesDesc = listOf(
        purchase("pkg2", t0.plusSeconds(3000), 39900), // пакет 60 минут (399 ₽), позже
        purchase("min1", t0.plusSeconds(1000), 4000), // поминутный (40 ₽), раньше
    )

    @Test
    fun `бесплатная поездка привязана к ближайшей предшествующей покупке`() {
        // Поездка после покупки пакета ⇒ покрыта им (399 ₽), а не более ранним поминутным.
        val covering = TariffAttribution.coveringKopecks(0, t0.plusSeconds(4000), purchasesDesc)
        assertEquals(39900, covering)
    }

    @Test
    fun `платная поездка тариф не подтягивает`() {
        assertNull(TariffAttribution.coveringKopecks(5243, t0.plusSeconds(4000), purchasesDesc))
    }

    @Test
    fun `бесплатная поездка раньше любой покупки — без тарифа (останется «бесплатно»)`() {
        assertNull(TariffAttribution.coveringKopecks(0, t0.minusSeconds(10), purchasesDesc))
    }
}
