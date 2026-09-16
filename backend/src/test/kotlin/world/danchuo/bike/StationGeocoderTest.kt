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
    fun `метро-адрес — один кандидат без скобок, с городом`() {
        assertEquals(listOf("ст. м. Молодёжная, Москва"), StationGeocoder.candidates("ст. м. Молодёжная (выход № 2)"))
        assertEquals(listOf("метро Кунцевская, Москва"), StationGeocoder.candidates("метро Кунцевская (Арбатско-Покровская)"))
    }

    @Test
    fun `дом с корпусом — кандидаты от точного к грубому (с корпусом, без, только улица)`() {
        assertEquals(
            listOf("Рублёвское шоссе, 22к1, Москва", "Рублёвское шоссе, 22, Москва", "Рублёвское шоссе, Москва"),
            StationGeocoder.candidates("Рублёвское шоссе, д. 22к1"),
        )
    }

    @Test
    fun `дом с буквой и строением — строение срезается в грубом варианте`() {
        assertEquals(
            listOf("Шмитовский проезд, 18А стр. 1, Москва", "Шмитовский проезд, 18А, Москва", "Шмитовский проезд, Москва"),
            StationGeocoder.candidates("Шмитовский проезд, д. 18А стр. 1"),
        )
    }

    @Test
    fun `адрес-заглушка «просто город» распознаётся (велосипед вне станции)`() {
        // The PWA returns a bare city name when the bike was left off a named station.
        // Geocoding that is forbidden: the city centroid would override the exact GPS.
        assertTrue(StationGeocoder.isCityPlaceholder("Москва"))
        assertTrue(StationGeocoder.isCityPlaceholder("  Москва  "))
        assertTrue(StationGeocoder.isCityPlaceholder("Зеленоград"))
    }

    @Test
    fun `настоящий адрес станции — не заглушка`() {
        assertFalse(StationGeocoder.isCityPlaceholder("ст. м. Молодёжная (выход № 2)"))
        assertFalse(StationGeocoder.isCityPlaceholder("ул. Ельнинская, д. 14к1"))
        assertFalse(StationGeocoder.isCityPlaceholder(" ул. Краснобогатырская,  д. 2 стр. 93"))
    }

    @Test
    fun `координаты парсятся из строковых lat lon Nominatim`() {
        assertEquals(55.7305 to 37.446, StationGeocoder.parseCoords(NominatimResult(lat = "55.7305", lon = "37.446")))
    }

    @Test
    fun `нет результата или битые числа — null (точка останется на GPS)`() {
        assertNull(StationGeocoder.parseCoords(null))
        assertNull(StationGeocoder.parseCoords(NominatimResult(lat = null, lon = "37.4")))
        assertNull(StationGeocoder.parseCoords(NominatimResult(lat = "нет", lon = "37.4")))
    }
}
