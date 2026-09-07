package world.danchuo.bike

import io.quarkus.cache.CacheResult
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * Кратчайший веломаршрут пары станций — знаменатель коридора (+40%). Нужен **каждому** броску,
 * а между станциями не меняется никогда: 100 поездок в базе дают всего 53 уникальные пары.
 *
 * Отдельным бином, а не методом [RandomPathService], намеренно: перехватчик `@CacheResult`
 * срабатывает только на вызовах через CDI-прокси, и обращение к собственному методу прошло бы
 * мимо кэша молча (см. `docs/pitfalls.md`).
 */
@ApplicationScoped
class RouteOptimumCache(private val graph: BikeRouteGraph) {

    @CacheResult(cacheName = "bike-route-optimum")
    fun optimumMeters(start: GeoPoint, finish: GeoPoint): Int? {
        val from = graph.nearest(start) ?: return null
        val to = graph.nearest(finish) ?: return null
        val path = graph.route(from, to) ?: return null
        return RandomPathGeometry.lengthMeters(graph.points(path)).roundToInt()
    }
}

/**
 * Кнопка «нарисовать **случайный** путь» (PRD §9 B4, DESIGN §7.6): выдаёт пачку придуманных
 * веломаршрутов между станциями поездки.
 *
 * Считает [BikeRouteGraph] — наш собственный граф OpenStreetMap, без единого внешнего вызова.
 * Броски одноразовые и ничем не ограничены сверху: посетитель жмёт кнопку сколько хочет. Значит
 * цена одного броска обязана быть нулём — платный роутер дорожал бы ровно вместе с интересом
 * к кнопке (у 2ГИС Routing это от 6700 ₽ за 10 000 запросов в месяц, и демо-ключ живёт месяц).
 *
 * Почему пачкой, а не по одному на нажатие: правило «два подряд пути рядом не лежат» требует
 * сравнивать новый путь с предыдущим, а значит кто-то должен помнить предыдущий. Пачка убирает
 * этот вопрос целиком — соседи внутри неё разведены здесь, где живёт алгоритм, и ни серверу, ни
 * клиенту не нужно хранить состояние между запросами.
 *
 * Сами пути **нигде не хранятся** — одноразовое развлечение посетителя, перерисовывать нечего.
 */
@ApplicationScoped
class RandomPathService(
    private val graph: BikeRouteGraph,
    private val optimums: RouteOptimumCache,
    @param:ConfigProperty(name = "danchuo.bike.routing.variants") private val variants: Int,
    @param:ConfigProperty(name = "danchuo.bike.routing.max-attempts") private val maxAttempts: Int,
) {

    private val log = Logger.getLogger(RandomPathService::class.java)

    /** Источник случайности. Тесты подменяют, чтобы прогонять пачки воспроизводимо. */
    internal var random: Random = Random.Default

    /**
     * Пачка непохожих друг на друга путей между станциями. Пустой список — штатный ответ:
     * графа нет, станции вне его или ничего не влезло в коридор.
     */
    fun randomPaths(start: GeoPoint, finish: GeoPoint): List<RandomPathView> {
        if (!graph.available) return emptyList()
        val from = graph.nearest(start) ?: return emptyList()
        val to = graph.nearest(finish) ?: return emptyList()
        val optimum = optimums.optimumMeters(start, finish)
        if (optimum == null || optimum <= 0) {
            log.warn("no optimum for the pair, random paths unavailable")
            return emptyList()
        }

        val result = mutableListOf<RandomPathView>()
        var previous: List<GeoPoint>? = null
        var previousAngle: Double? = null
        var attempts = 0

        while (result.size < variants && attempts < maxAttempts) {
            attempts++
            // Угол — единственный источник случайности в постановке точки; крюк задаётся числом.
            // Следующий бросок уходит на противоположную сторону эллипса (±60°): это дешёвая
            // половина правила «рядом не лежат», дорогую делает проверка перекрытия ниже.
            val angle = previousAngle
                ?.let { it + PI + (random.nextDouble() - 0.5) * (2 * PI / 3) }
                ?: (random.nextDouble() * 2 * PI)
            val detour = MIN_DETOUR + random.nextDouble() * (MAX_DETOUR - MIN_DETOUR)
            val waypoint = RandomPathGeometry.waypointOnEllipse(start, finish, detour, angle)
            val via = graph.nearest(waypoint) ?: continue
            if (via == from || via == to) continue

            // Второй источник разнообразия — надбавка к цене улиц: роутер честно ищет оптимум,
            // но уже в чуть другом городе и потому выбирает другие улицы.
            val seed = random.nextInt()
            val jitter = MIN_JITTER + random.nextDouble() * (MAX_JITTER - MIN_JITTER)
            val head = graph.route(from, via, jitter, seed) ?: continue
            val tail = graph.route(via, to, jitter, seed + 7) ?: continue

            val points = graph.points(head + tail.drop(1))
            val length = RandomPathGeometry.lengthMeters(points)
            if (!RandomPathGeometry.withinCorridor(length, optimum.toDouble())) continue
            if (previous != null &&
                RandomPathGeometry.overlapFraction(points, previous) > RandomPathGeometry.MAX_OVERLAP
            ) {
                continue
            }

            val meters = length.roundToInt()
            result += RandomPathView(
                points = points.map { listOf(it.lat, it.lon) },
                distanceMeters = meters,
                optimumMeters = optimum,
                // Отрицательным быть не может по построению, но роутер с надбавкой к ценам
                // изредка находит путь на метр короче «честного» оптимума — показывать «−0%» глупо.
                overPercent = (((meters.toDouble() / optimum) - 1) * 100).roundToInt().coerceAtLeast(0),
            )
            previous = points
            previousAngle = angle
        }
        return result
    }

    /**
     * Пачка петель вокруг станции — для поездки, вернувшейся туда, откуда началась (таких в
     * истории 4 из 57). Кратчайшего пути между точкой и ей же не существует, поэтому коридор
     * «+40% к оптимуму» здесь неприменим: масштаб петле задаёт САМА ПОЕЗДКА — сколько человек
     * тогда накрутил, столько примерно и рисуем.
     *
     * Форма — треугольник: станция и две точки по случайным курсам, разведённым на 120°. Просто
     * «туда и обратно» через одну точку дало бы путь, полностью лежащий на себе самом.
     */
    fun randomLoops(center: GeoPoint, rideMeters: Int): List<RandomPathView> {
        if (!graph.available) return emptyList()
        val home = graph.nearest(center) ?: return emptyList()
        // Нулевая поездка (взял и сразу вернул — таких две) масштаба не задаёт: берём прогулочный.
        val target = (if (rideMeters > 0) rideMeters else DEFAULT_LOOP_METERS)
            .coerceIn(MIN_LOOP_METERS, MAX_LOOP_METERS)
            .toDouble()

        val result = mutableListOf<RandomPathView>()
        var previous: List<GeoPoint>? = null
        var attempts = 0

        while (result.size < variants && attempts < maxAttempts) {
            attempts++
            val bearing = random.nextDouble() * 2 * PI
            val radius = target / LOOP_SHAPE
            val first = graph.nearest(RandomPathGeometry.pointAtBearing(center, radius, bearing))
                ?: continue
            val second = graph.nearest(
                RandomPathGeometry.pointAtBearing(center, radius, bearing + 2 * PI / 3),
            ) ?: continue
            if (first == home || second == home || first == second) continue

            val seed = random.nextInt()
            val jitter = MIN_JITTER + random.nextDouble() * (MAX_JITTER - MIN_JITTER)
            val legs = listOf(home to first, first to second, second to home)
            val nodes = mutableListOf<Int>()
            var whole = true
            for ((i, leg) in legs.withIndex()) {
                val part = graph.route(leg.first, leg.second, jitter, seed + i)
                if (part == null) {
                    whole = false
                    break
                }
                nodes += if (nodes.isEmpty()) part else part.drop(1)
            }
            if (!whole || nodes.size < 2) continue

            val points = graph.points(nodes)
            val length = RandomPathGeometry.lengthMeters(points)
            // Окно широкое, и это не небрежность: во что превратится треугольник, знает только
            // сеть улиц — по прямой петля короче, по дворам длиннее, и предсказать крюк заранее
            // нечем. Окно отсекает не «неточные» петли, а вырожденные — вчетверо длиннее заказа.
            if (length < target * MIN_LOOP_RATIO || length > target * MAX_LOOP_RATIO) continue
            if (previous != null &&
                RandomPathGeometry.overlapFraction(points, previous) > RandomPathGeometry.MAX_OVERLAP
            ) {
                continue
            }

            result += RandomPathView(
                points = points.map { listOf(it.lat, it.lon) },
                distanceMeters = length.roundToInt(),
                // Оптимума у петли нет — и ноль здесь СИГНАЛ окну: не показывать «+N% к оптимуму»,
                // потому что сравнивать не с чем (см. RidesModal).
                optimumMeters = 0,
                overPercent = 0,
            )
            previous = points
        }
        return result
    }

    private companion object {
        /**
         * Целевой крюк по прямой. Верхняя граница ниже потолка коридора (1,4) намеренно: дорожный
         * путь всегда длиннее прямой, и целясь ровно в потолок мы бы отбраковывали почти всё.
         */
        const val MIN_DETOUR = 1.06
        const val MAX_DETOUR = 1.34

        /** Насколько шевелим цены улиц. Ноль дал бы один и тот же путь через ту же точку. */
        const val MIN_JITTER = 0.25
        const val MAX_JITTER = 0.9

        /**
         * Во сколько раз петля длиннее радиуса треугольника. Периметр правильного треугольника
         * с вершиной в центре — около 3,73 радиуса; делим на чуть большее число, потому что по
         * улицам путь всегда длиннее прямой и без поправки петли выходили бы систематически
         * крупнее заказанных.
         */
        const val LOOP_SHAPE = 4.6
        const val MIN_LOOP_RATIO = 0.55
        const val MAX_LOOP_RATIO = 1.8

        /** Масштаб петли, когда поездка его не задаёт (дистанция ноль) и рамки разумного. */
        const val DEFAULT_LOOP_METERS = 2500
        const val MIN_LOOP_METERS = 800
        const val MAX_LOOP_METERS = 15_000
    }
}
