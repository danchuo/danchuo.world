package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pure station-geocoder helpers, no network or DB: address preparation and parsing of the
 * Nominatim reply. The background tick itself hits Nominatim and the DB and is not run here.
 */
class StationGeocoderTest {

    @Test
    fun `a metro address — one candidate without brackets, with the city`() {
        assertEquals(listOf("ст. м. Молодёжная, Москва"), StationGeocoder.candidates("ст. м. Молодёжная (выход № 2)"))
        assertEquals(listOf("метро Кунцевская, Москва"), StationGeocoder.candidates("метро Кунцевская (Арбатско-Покровская)"))
    }

    @Test
    fun `a house with a block — candidates from exact to coarse (with the block, without, street only)`() {
        assertEquals(
            listOf("Рублёвское шоссе, 22к1, Москва", "Рублёвское шоссе, 22, Москва", "Рублёвское шоссе, Москва"),
            StationGeocoder.candidates("Рублёвское шоссе, д. 22к1"),
        )
    }

    @Test
    fun `a house with a letter and a building — the building is cut in the coarse variant`() {
        assertEquals(
            listOf("Шмитовский проезд, 18А стр. 1, Москва", "Шмитовский проезд, 18А, Москва", "Шмитовский проезд, Москва"),
            StationGeocoder.candidates("Шмитовский проезд, д. 18А стр. 1"),
        )
    }

    @Test
    fun `a "just the city" placeholder address is recognised (a bike off-station)`() {
        // The PWA returns a bare city name when the bike was left off a named station.
        // Geocoding that is forbidden: the city centroid would override the exact GPS.
        assertTrue(StationGeocoder.isCityPlaceholder("Москва"))
        assertTrue(StationGeocoder.isCityPlaceholder("  Москва  "))
        assertTrue(StationGeocoder.isCityPlaceholder("Зеленоград"))
    }

    @Test
    fun `a real station address is not a placeholder`() {
        assertFalse(StationGeocoder.isCityPlaceholder("ст. м. Молодёжная (выход № 2)"))
        assertFalse(StationGeocoder.isCityPlaceholder("ул. Ельнинская, д. 14к1"))
        assertFalse(StationGeocoder.isCityPlaceholder(" ул. Краснобогатырская,  д. 2 стр. 93"))
    }

    @Test
    fun `coordinates are parsed from Nominatim's string lat lon`() {
        assertEquals(55.7305 to 37.446, StationGeocoder.parseCoords(NominatimResult(lat = "55.7305", lon = "37.446")))
    }

    @Test
    fun `no result or broken numbers — null (the point stays on GPS)`() {
        assertNull(StationGeocoder.parseCoords(null))
        assertNull(StationGeocoder.parseCoords(NominatimResult(lat = null, lon = "37.4")))
        assertNull(StationGeocoder.parseCoords(NominatimResult(lat = "нет", lon = "37.4")))
    }
}
