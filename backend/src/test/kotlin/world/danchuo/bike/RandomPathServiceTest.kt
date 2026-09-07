package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

/**
 * Оркестровка пачки случайных путей ([RandomPathService]) на синтетическом графе — решётке улиц
 * вместо московской. Проверяем контракты, ради которых механика написана: коридор длины,
 * непохожесть соседей, размер пачки и тихая деградация без графа.
 *
 * Настоящий граф ([BikeRouteGraph]) здесь не грузим: он ресурс на несколько мегабайт, и от него
 * зависит скорость, а не логика. Решётка же даёт много разных путей между теми же точками —
 * ровно то, на чём эта логика и должна проверяться.
 */
class RandomPathServiceTest {

    private val start = GeoPoint(55.7500, 37.6000)
    private val finish = GeoPoint(55.7600, 37.6300)

    /**
     * Решётка узлов шагом ~110 м: улицы идут строго на север и на восток. Пути по ней выходят
     * «манхэттенские», зато их между двумя точками много и они честно разной формы.
     */
    private open class Lattice(
        private val rows: Int = 26,
        private val cols: Int = 34,
        private val lat0: Double = 55.744,
        private val lon0: Double = 37.590,
        private val step: Double = 0.001,
        private val broken: Boolean = false,
    ) : BikeRouteGraph() {

        override val available: Boolean get() = !broken

        private fun id(r: Int, c: Int) = r * cols + c

        override fun point(node: Int): GeoPoint =
            GeoPoint(lat0 + (node / cols) * step, lon0 + (node % cols) * step * 1.8)

        override fun nearest(p: GeoPoint): Int? {
            if (broken) return null
            val r = ((p.lat - lat0) / step).toInt().coerceIn(0, rows - 1)
            val c = ((p.lon - lon0) / (step * 1.8)).toInt().coerceIn(0, cols - 1)
            return id(r, c)
        }

        /** A* на решётке ни к чему: жадно шагаем к цели, разнообразие даёт порядок осей. */
        override fun route(from: Int, to: Int, jitter: Double, seed: Int): List<Int>? {
            if (broken) return null
            var r = from / cols
            var c = from % cols
            val tr = to / cols
            val tc = to % cols
            val path = mutableListOf(from)
            // Порядок осей зависит от seed — так разные заходы дают разные ломаные, как у
            // настоящего роутера с надбавкой к ценам улиц.
            val rowsFirst = (seed and 1) == 0
            for (phase in 0..1) {
                val doRows = if (rowsFirst) phase == 0 else phase == 1
                while (if (doRows) r != tr else c != tc) {
                    if (doRows) r += if (tr > r) 1 else -1 else c += if (tc > c) 1 else -1
                    path += id(r, c)
                }
            }
            return path
        }
    }

    private fun service(
        graph: BikeRouteGraph,
        variants: Int = 4,
        maxAttempts: Int = 14,
        seed: Int = 7,
    ): RandomPathService =
        RandomPathService(graph, RouteOptimumCache(graph), variants, maxAttempts)
            .apply { random = Random(seed) }

    @Test
    fun `без графа пачка пустая`() {
        assertTrue(service(Lattice(broken = true)).randomPaths(start, finish).isEmpty())
    }

    @Test
    fun `каждый путь укладывается в коридор плюс сорок процентов`() {
        val paths = service(Lattice()).randomPaths(start, finish)
        assertTrue(paths.isNotEmpty(), "ожидали непустую пачку")
        paths.forEach {
            assertTrue(
                it.distanceMeters <= it.optimumMeters * RandomPathGeometry.CORRIDOR + 1,
                "путь ${it.distanceMeters} м выбил коридор при оптимуме ${it.optimumMeters} м",
            )
            assertTrue(it.overPercent in 0..40, "крюк ${it.overPercent}% вне коридора")
        }
    }

    @Test
    fun `соседние пути в пачке не лежат друг на друге`() {
        val paths = service(Lattice()).randomPaths(start, finish)
        assertTrue(paths.size >= 2, "для проверки соседства нужна пачка хотя бы из двух")
        for (i in 1 until paths.size) {
            val previous = paths[i - 1].points.map { GeoPoint(it[0], it[1]) }
            val current = paths[i].points.map { GeoPoint(it[0], it[1]) }
            val overlap = RandomPathGeometry.overlapFraction(current, previous)
            assertTrue(
                overlap <= RandomPathGeometry.MAX_OVERLAP,
                "соседние броски перекрылись на ${(overlap * 100).toInt()}%",
            )
        }
    }

    @Test
    fun `пачка не длиннее заказанного`() {
        val paths = service(Lattice(), variants = 3).randomPaths(start, finish)
        assertTrue(paths.size <= 3, "в пачке ${paths.size} путей вместо трёх")
    }

    @Test
    fun `одинаковые пути не размножаются в пачке`() {
        // Граф, в котором любой бросок даёт ОДИН И ТОТ ЖЕ маршрут: и промежуточная точка всегда
        // одна, и порядок осей не зависит от захода. Всё, кроме первого пути, обязано отпасть
        // по перекрытию — иначе правило «два подряд рядом не лежат» ничего не значит.
        val fixed = object : Lattice() {
            override fun nearest(p: GeoPoint): Int? {
                val node = super.nearest(p)
                val isStation = p == start || p == finish
                return if (isStation) node else super.nearest(GeoPoint(55.7555, 37.6100))
            }

            override fun route(from: Int, to: Int, jitter: Double, seed: Int): List<Int>? =
                super.route(from, to, 0.0, 0)
        }
        assertEquals(1, service(fixed).randomPaths(start, finish).size)
    }

    @Test
    fun `непроходимый граф не роняет запрос`() {
        val dead = object : Lattice() {
            override fun route(from: Int, to: Int, jitter: Double, seed: Int): List<Int>? = null
        }
        assertTrue(service(dead).randomPaths(start, finish).isEmpty())
    }

    // ── Петли: поездка вернулась на ту же станцию ────────────────────────────────────────
    // Таких в истории 4 из 57, и у двух из них дистанция вообще нулевая. Кратчайшего пути между
    // точкой и ей же не существует, поэтому механика коридора здесь неприменима — петля
    // строится вокруг станции и меряется не оптимумом, а длиной самой поездки.

    private val station = GeoPoint(55.7570, 37.6250)

    @Test
    fun `петля начинается и кончается у станции`() {
        val loops = service(Lattice()).randomLoops(station, 2000)
        assertTrue(loops.isNotEmpty(), "ожидали непустую пачку петель")
        loops.forEach {
            val first = GeoPoint(it.points.first()[0], it.points.first()[1])
            val last = GeoPoint(it.points.last()[0], it.points.last()[1])
            assertTrue(
                RandomPathGeometry.distanceMeters(first, last) < 1.0,
                "петля разомкнулась: $first ≠ $last",
            )
        }
    }

    @Test
    fun `длина петли соразмерна заказанной`() {
        val loops = service(Lattice()).randomLoops(station, 2000)
        assertTrue(loops.isNotEmpty())
        loops.forEach {
            assertTrue(
                it.distanceMeters in 1000..3600,
                "петля ${it.distanceMeters} м не похожа на заказанные 2000",
            )
        }
    }

    @Test
    fun `у петли нет оптимума, и она об этом честно говорит`() {
        // `optimumMeters = 0` — сигнал окну не показывать «+N% к оптимуму»: сравнивать не с чем.
        service(Lattice()).randomLoops(station, 2000).forEach {
            assertEquals(0, it.optimumMeters)
            assertEquals(0, it.overPercent)
        }
    }

    @Test
    fun `нулевая длина поездки не мешает нарисовать петлю`() {
        // Взял велосипед и сразу вернул: длины нет, но выдуманный путь всё равно рисуется.
        assertTrue(service(Lattice()).randomLoops(station, 0).isNotEmpty())
    }

    @Test
    fun `соседние петли не лежат друг на друге`() {
        val loops = service(Lattice()).randomLoops(station, 2000)
        assertTrue(loops.size >= 2, "для проверки соседства нужна пачка хотя бы из двух")
        for (i in 1 until loops.size) {
            val previous = loops[i - 1].points.map { GeoPoint(it[0], it[1]) }
            val current = loops[i].points.map { GeoPoint(it[0], it[1]) }
            assertTrue(
                RandomPathGeometry.overlapFraction(current, previous) <= RandomPathGeometry.MAX_OVERLAP,
                "соседние петли перекрылись",
            )
        }
    }

    @Test
    fun `без графа петель тоже нет`() {
        assertTrue(service(Lattice(broken = true)).randomLoops(station, 2000).isEmpty())
    }
}
