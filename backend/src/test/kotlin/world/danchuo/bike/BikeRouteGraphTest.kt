package world.danchuo.bike

import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

/**
 * Настоящий граф велодорог Москвы из ресурсов ([BikeRouteGraph]) — на нём проверяется то, что на
 * синтетической решётке проверить нечем: что бинарь читается тем же форматом, каким записан
 * (`backend/tools/build-bike-graph.py`), что станции попадают в граф и что A\* находит между ними
 * правдоподобный веломаршрут.
 *
 * Точки — настоящая поездка из истории: Чистопрудный бульвар → Малая Никитская.
 */
class BikeRouteGraphTest {

    private val graph = BikeRouteGraph()
    private val chistoprudny = GeoPoint(55.76431, 37.63974)
    private val nikitskaya = GeoPoint(55.7581582, 37.5963487)

    @Test
    fun `граф читается из ресурсов`() {
        assertTrue(graph.available, "граф не загрузился — проверь ресурс bike/moscow-bike-graph.bin.gz")
    }

    @Test
    fun `станции попадают на граф, а не в чистое поле`() {
        for (station in listOf(chistoprudny, nikitskaya)) {
            val node = graph.nearest(station)
            assertNotNull(node)
            val snapped = graph.point(node!!)
            val off = RandomPathGeometry.distanceMeters(station, snapped)
            // Улица рядом со станцией обязана быть: сотня метров — уже подозрительно.
            assertTrue(off < 100.0, "станция $station села на узел в $off м от себя")
        }
    }

    @Test
    fun `между станциями находится правдоподобный веломаршрут`() {
        val from = graph.nearest(chistoprudny)!!
        val to = graph.nearest(nikitskaya)!!
        val path = graph.route(from, to)
        assertNotNull(path, "маршрут между станциями не нашёлся")

        val points = graph.points(path!!)
        val length = RandomPathGeometry.lengthMeters(points)
        val straight = RandomPathGeometry.distanceMeters(chistoprudny, nikitskaya)
        // По улицам всегда длиннее прямой, но не вдвое: это центр города, а не объезд реки.
        assertTrue(
            length > straight && length < straight * 1.8,
            "маршрут $length м при прямой $straight м — не похоже на дорожный путь",
        )
        assertTrue(points.size > 20, "ломаная из ${points.size} точек — слишком грубая для 3 км")
    }

    @Test
    fun `надбавка к ценам улиц меняет маршрут`() {
        val from = graph.nearest(chistoprudny)!!
        val to = graph.nearest(nikitskaya)!!
        val plain = graph.points(graph.route(from, to)!!)
        val shaken = graph.points(graph.route(from, to, jitter = 0.8, seed = 12345)!!)
        // Сравниваем САМУ ЛОМАНУЮ, а не геометрическое перекрытие. Перекрытие здесь мерило
        // негодное: в графе есть тротуары, а тротуар лежит в метрах от своей проезжей части —
        // ушедший на него маршрут по расстоянию неотличим от прежнего (перекрытие 100%), хотя
        // рёбра у него другие. Для правила «два броска рядом не лежат» такая мера как раз верна
        // (на глаз это и есть тот же путь), а вот «надбавка работает» она не проверяет.
        assertTrue(
            shaken != plain,
            "надбавка ничего не изменила: роутер вернул ту же ломаную из ${plain.size} точек",
        )
    }

    @Test
    fun `пачка путей считается достаточно быстро для нажатия кнопки`() {
        val service = RandomPathService(graph, RouteOptimumCache(graph), 6, 14)
            .apply { random = Random(1) }
        // Прогрев: первый вызов платит за загрузку графа, а меряем мы работу, а не старт.
        service.randomPaths(chistoprudny, nikitskaya)

        val started = System.nanoTime()
        val paths = service.randomPaths(chistoprudny, nikitskaya)
        val elapsedMs = (System.nanoTime() - started) / 1_000_000

        assertTrue(paths.isNotEmpty(), "на настоящем графе пачка обязана собраться")
        println("пачка из ${paths.size} путей за $elapsedMs мс")
        // Потолок щедрый: тест гоняется и на холодной CI-машине. Он ловит не медленность,
        // а провал в секунды — то есть возврат Дейкстры вместо A* или потерю эвристики.
        // Потолок с запасом: замер на машине владельца — 179 мс на пачку из шести путей по
        // графу в 920 тысяч узлов. Тест ловит не медленность, а провал в секунды — то есть
        // возврат Дейкстры вместо A* или потерю эвристики.
        assertTrue(elapsedMs < 6000, "пачка считалась $elapsedMs мс — слишком долго для кнопки")
    }
}
