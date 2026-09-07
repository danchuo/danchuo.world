package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Чистая геометрия «случайного пути» (PRD §9 B4): коридор длины, точка на эллипсе, перекрытие
 * соседних бросков и разбор WKT из ответа роутера. Без сети и БД — здесь живёт вся суть механики,
 * поэтому она и покрыта тестами, а оркестровка ([RandomPathService]) проверяется отдельно.
 */
class RandomPathGeometryTest {

    private val chistoprudny = GeoPoint(55.76431, 37.63974)
    private val nikitskaya = GeoPoint(55.7581582, 37.5963487)

    @Test
    fun `расстояние между станциями считается в метрах`() {
        val d = RandomPathGeometry.distanceMeters(chistoprudny, nikitskaya)
        // ~2,8 км по прямой между Чистопрудным бульваром и Малой Никитской
        assertTrue(d in 2600.0..3000.0, "ожидали ~2,8 км, получили $d")
    }

    @Test
    fun `точка на эллипсе даёт ровно заданный крюк по прямой`() {
        val straight = RandomPathGeometry.distanceMeters(chistoprudny, nikitskaya)
        for (detour in listOf(1.05, 1.2, 1.4)) {
            for (angle in listOf(0.0, 1.1, 3.0, 5.2)) {
                val wp = RandomPathGeometry.waypointOnEllipse(chistoprudny, nikitskaya, detour, angle)
                val viaSum = RandomPathGeometry.distanceMeters(chistoprudny, wp) +
                    RandomPathGeometry.distanceMeters(wp, nikitskaya)
                // Сумма расстояний до фокусов на эллипсе постоянна и равна большой оси:
                // именно это свойство и делает крюк задаваемым заранее.
                assertEquals(straight * detour, viaSum, straight * 0.02,
                    "крюк $detour под углом $angle разъехался")
            }
        }
    }

    @Test
    fun `противоположные углы уводят точку по разные стороны от прямой`() {
        val a = RandomPathGeometry.waypointOnEllipse(chistoprudny, nikitskaya, 1.25, 1.4)
        val b = RandomPathGeometry.waypointOnEllipse(chistoprudny, nikitskaya, 1.25, 1.4 + Math.PI)
        assertTrue(
            RandomPathGeometry.distanceMeters(a, b) > 500.0,
            "точки на разных сторонах эллипса обязаны разъехаться, а разошлись на " +
                RandomPathGeometry.distanceMeters(a, b),
        )
    }

    @Test
    fun `коридор пускает только длины от оптимума до оптимума на 1,4`() {
        val optimum = 3000.0
        assertTrue(RandomPathGeometry.withinCorridor(3000.0, optimum))
        assertTrue(RandomPathGeometry.withinCorridor(4100.0, optimum))
        assertTrue(RandomPathGeometry.withinCorridor(4200.0, optimum))
        assertFalse(RandomPathGeometry.withinCorridor(4300.0, optimum))
        // Короче оптимума роутер не отдаёт, но если отдал — это не повод падать.
        assertTrue(RandomPathGeometry.withinCorridor(2900.0, optimum))
    }

    @Test
    fun `длина ломаной складывается из звеньев`() {
        val path = listOf(
            GeoPoint(55.760, 37.600),
            GeoPoint(55.765, 37.600),
            GeoPoint(55.765, 37.610),
        )
        val expected = RandomPathGeometry.distanceMeters(path[0], path[1]) +
            RandomPathGeometry.distanceMeters(path[1], path[2])
        assertEquals(expected, RandomPathGeometry.lengthMeters(path), 0.5)
    }

    @Test
    fun `путь сам с собой перекрыт целиком`() {
        val path = listOf(
            GeoPoint(55.760, 37.600),
            GeoPoint(55.765, 37.600),
            GeoPoint(55.765, 37.610),
        )
        assertEquals(1.0, RandomPathGeometry.overlapFraction(path, path), 0.01)
    }

    @Test
    fun `разошедшиеся пути не перекрываются`() {
        val a = listOf(GeoPoint(55.760, 37.600), GeoPoint(55.765, 37.600))
        val b = listOf(GeoPoint(55.740, 37.660), GeoPoint(55.745, 37.660))
        assertEquals(0.0, RandomPathGeometry.overlapFraction(a, b), 0.01)
    }

    @Test
    fun `наполовину общий путь даёт перекрытие около половины`() {
        // Первое звено общее, второе уезжает в сторону — звенья примерно равной длины.
        val previous = listOf(
            GeoPoint(55.7600, 37.6000),
            GeoPoint(55.7645, 37.6000),
            GeoPoint(55.7690, 37.6000),
        )
        val path = listOf(
            GeoPoint(55.7600, 37.6000),
            GeoPoint(55.7645, 37.6000),
            GeoPoint(55.7645, 37.6080),
        )
        val overlap = RandomPathGeometry.overlapFraction(path, previous)
        assertTrue(overlap in 0.35..0.65, "ожидали около половины, получили $overlap")
    }

    @Test
    fun `пустой путь не перекрыт ничем и не делит на ноль`() {
        assertEquals(0.0, RandomPathGeometry.overlapFraction(emptyList(), emptyList()), 0.001)
        assertEquals(0.0, RandomPathGeometry.overlapFraction(listOf(GeoPoint(55.0, 37.0)), emptyList()), 0.001)
    }

    @Test
    fun `точка по курсу лежит на заданном расстоянии`() {
        val from = GeoPoint(55.7558, 37.6173)
        for (deg in 0 until 360 step 30) {
            val p = RandomPathGeometry.pointAtBearing(from, 1000.0, Math.toRadians(deg.toDouble()))
            val d = RandomPathGeometry.distanceMeters(from, p)
            assertEquals(1000.0, d, 5.0, "курс $deg° увёл на $d м вместо 1000")
        }
    }

    @Test
    fun `курс ноль ведёт на север, четверть оборота — на восток`() {
        val from = GeoPoint(55.7558, 37.6173)
        val north = RandomPathGeometry.pointAtBearing(from, 500.0, 0.0)
        assertTrue(north.lat > from.lat, "север обязан увеличивать широту")
        assertEquals(from.lon, north.lon, 1e-9)

        val east = RandomPathGeometry.pointAtBearing(from, 500.0, Math.PI / 2)
        assertTrue(east.lon > from.lon, "восток обязан увеличивать долготу")
        assertEquals(from.lat, east.lat, 1e-9)
    }

    @Test
    fun `нулевое расстояние оставляет точку на месте`() {
        val from = GeoPoint(55.7558, 37.6173)
        val same = RandomPathGeometry.pointAtBearing(from, 0.0, 1.234)
        assertEquals(from.lat, same.lat, 1e-9)
        assertEquals(from.lon, same.lon, 1e-9)
    }
}
