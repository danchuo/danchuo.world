package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Чистые хелперы геокодера станций (без сети/БД): подготовка адреса к геокодингу и разбор ответа
 * Nominatim. Сам фоновый тик ([StationGeocoder.tick]) — внешний Nominatim + БД, здесь не гоняем.
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
