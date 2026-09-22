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
 * The purchase-history contract (`/api/purchases/history`) pinned on an anonymised fixture: only
 * `TARIFF` purchases are stored, `RENTAL` charges are dropped, minutes map from `orderItems`.
 */
class TariffMappingTest {

    private val mapper = ObjectMapper().registerKotlinModule()

    private fun loadPage(): PurchasePage {
        val json = javaClass.getResourceAsStream("/fixtures/velobike-purchases-page.json")!!
            .readBytes().toString(Charsets.UTF_8)
        return mapper.readValue(json, PurchasePage::class.java)
    }

    @Test
    fun `parses a purchase history page`() {
        val page = loadPage()
        assertEquals(4, page.content.size)
        assertEquals(42, page.totalElements)
        assertFalse(page.last)
    }

    @Test
    fun `TARIFF is a tariff purchase, RENTAL is not`() {
        val page = loadPage()
        val tariff = page.content.first { it.idPurchase == 2715716L }
        val rental = page.content.first { it.idPurchase == 2716277L }
        assertTrue(TariffMapper.isTariffPurchase(tariff))
        assertFalse(TariffMapper.isTariffPurchase(rental)) // a ride charge is not stored
    }

    @Test
    fun `maps a pack purchase — the price in kopecks, the minutes from the title`() {
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
    fun `a per-minute tariff — no minutes are parsed (no pack)`() {
        val item = loadPage().content.first { it.idPurchase == 2757350L }
        val tariff = BikeTariff()
        TariffMapper.applyTo(tariff, item)
        assertEquals(4000, tariff.priceKopecks) // 40 ₽
        assertEquals("Доступ Поминутный", tariff.name)
        assertNull(tariff.minutes)
    }

    // --- Access purchases bound to a ride, coverage to the rest (TariffAttribution) ---

    private fun purchase(id: String, at: Instant, kopecks: Int, name: String) = BikeTariff().apply {
        externalId = id
        purchasedAt = at
        priceKopecks = kopecks
        this.name = name
    }

    private fun ride(id: Long, at: Instant, cost: Int, tariff: String) = Ride().apply {
        externalId = id
        startTime = at
        finishTime = at.plusSeconds(600)
        costKopecks = cost
        tariffName = tariff
    }

    private val t0: Instant = Instant.parse("2026-07-10T09:00:00Z")

    @Test
    fun `access bought for a ride pays for that ride`() {
        // What really happens: the access package is bought seconds before the ride starts.
        val buy = purchase("p1", t0, 39900, "Доступ Пакет 60 минут")
        val r = ride(1, t0.plusSeconds(6), 749, "Пакет 60 минут")

        val money = TariffAttribution.attribute(listOf(r), listOf(buy))[1L]!!

        assertEquals(39900, money.accessKopecks) // the 399 ₽ access is THIS ride's money
        assertNull(money.coveredByTariffKopecks) // it bought the access itself, so "covered" is moot
    }

    @Test
    fun `later rides under the same pack do not pay for the access — they are only covered by it`() {
        val buy = purchase("p1", t0, 39900, "Доступ Пакет 60 минут")
        val first = ride(1, t0.plusSeconds(6), 0, "Пакет 60 минут")
        val second = ride(2, t0.plusSeconds(4000), 0, "Пакет 60 минут")
        val third = ride(3, t0.plusSeconds(20000), 15400, "Пакет 60 минут") // ran past the package

        val money = TariffAttribution.attribute(listOf(first, second, third), listOf(buy))

        assertEquals(39900, money[1L]!!.accessKopecks)
        assertNull(money[2L]!!.accessKopecks) // the same 399 ₽ is not taken a second time
        assertEquals(39900, money[2L]!!.coveredByTariffKopecks)
        assertNull(money[3L]!!.accessKopecks)
        assertEquals(39900, money[3L]!!.coveredByTariffKopecks) // the overage past the package
    }

    @Test
    fun `per-minute access pays for its own ride — the minutes go on top of it`() {
        val buy = purchase("p1", t0, 4000, "Доступ Поминутный")
        val r = ride(1, t0.plusSeconds(8), 1498, "Поминутный")

        val money = TariffAttribution.attribute(listOf(r), listOf(buy))[1L]!!

        assertEquals(4000, money.accessKopecks) // the 40 ₽ paid start — what the board was missing
        assertNull(money.coveredByTariffKopecks)
    }

    @Test
    fun `another tariff's access does not stick to the ride`() {
        val buy = purchase("p1", t0, 4000, "Доступ Поминутный")
        val r = ride(1, t0.plusSeconds(8), 0, "Пакет 60 минут")

        val money = TariffAttribution.attribute(listOf(r), listOf(buy))[1L]!!

        assertNull(money.accessKopecks)
        assertNull(money.coveredByTariffKopecks)
    }

    @Test
    fun `access bought and not ridden is not attached to any ride`() {
        // Access bought, no ride in the window: the next per-minute ride is three days later.
        val buy = purchase("p1", t0, 4000, "Доступ Поминутный")
        val far = ride(1, t0.plusSeconds(3 * 24 * 3600), 0, "Поминутный")

        val money = TariffAttribution.attribute(listOf(far), listOf(buy))[1L]!!

        assertNull(money.accessKopecks)
    }

    @Test
    fun `per-minute access does not cover later rides — it has no included minutes`() {
        val buy = purchase("p1", t0, 4000, "Доступ Поминутный")
        val own = ride(1, t0.plusSeconds(8), 1498, "Поминутный")
        val next = ride(2, t0.plusSeconds(7200), 0, "Поминутный") // it has no purchase of its own

        val money = TariffAttribution.attribute(listOf(own, next), listOf(buy))

        assertNull(money[2L]!!.accessKopecks)
        assertNull(money[2L]!!.coveredByTariffKopecks)
    }

    @Test
    fun `a ride before any purchase — neither access nor coverage`() {
        val buy = purchase("p1", t0, 39900, "Доступ Пакет 60 минут")
        val before = ride(1, t0.minusSeconds(600), 5243, "Пакет 60 минут")

        val money = TariffAttribution.attribute(listOf(before), listOf(buy))[1L]!!

        assertNull(money.accessKopecks)
        assertNull(money.coveredByTariffKopecks)
    }

    @Test
    fun `coverage does not reach back from the week before last`() {
        val buy = purchase("p1", t0, 39900, "Доступ Пакет 60 минут")
        val owner = ride(1, t0.plusSeconds(6), 0, "Пакет 60 минут")
        val late = ride(2, t0.plusSeconds(14 * 24 * 3600), 0, "Пакет 60 минут")

        val money = TariffAttribution.attribute(listOf(owner, late), listOf(buy))

        assertNull(money[2L]!!.coveredByTariffKopecks)
    }

    @Test
    fun `each purchase goes to its own ride, not the first one found`() {
        val first = purchase("p1", t0, 4000, "Доступ Поминутный")
        val second = purchase("p2", t0.plusSeconds(7200), 4000, "Доступ Поминутный")
        val r1 = ride(1, t0.plusSeconds(5), 1498, "Поминутный")
        val r2 = ride(2, t0.plusSeconds(7205), 2996, "Поминутный")

        val money = TariffAttribution.attribute(listOf(r1, r2), listOf(first, second))

        assertEquals(4000, money[1L]!!.accessKopecks)
        assertEquals(4000, money[2L]!!.accessKopecks)
    }
}
