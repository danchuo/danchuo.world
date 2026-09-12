package world.danchuo.bike

import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import java.io.DataInputStream
import java.io.EOFException
import java.io.InputStream
import java.util.PriorityQueue
import java.util.zip.GZIPInputStream
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * Граф велодорог Москвы из OpenStreetMap — собственный роутер для кнопки «нарисовать случайный
 * путь» (PRD §9 B4).
 *
 * Почему свой, а не внешний API: броски одноразовые и ничем не ограничены сверху — посетитель
 * жмёт кнопку сколько хочет. Тариф на вызов (у 2ГИС Routing это от 6700 ₽ за 10 000 запросов в
 * месяц) означал бы, что развлечение дорожает вместе с интересом к нему. Свой граф стоит ноль
 * при любом числе бросков и не может протухнуть вместе с демо-ключом.
 *
 * Данные лежат ресурсом [RESOURCE] — компактный бинарь, собранный `backend/tools/build-bike-graph.py`
 * (там же формат и область). Обновлять раз в полгода тем же скриптом.
 *
 * Загрузка **ленивая**: граф нужен только тому, кто нажал кнопку, и держать его в памяти на
 * инстансе, где кнопку никто не трогал, незачем. Файла нет ⇒ [available] = false и тихая
 * деградация, как у слайса без ключа.
 */
@ApplicationScoped
class BikeRouteGraph {

    private val log = Logger.getLogger(BikeRouteGraph::class.java)

    /** Узлы и рёбра в примитивных массивах: 200k узлов объектами стоили бы на порядок дороже. */
    private class Data(
        val latMicro: IntArray,
        val lonMicro: IntArray,
        /** Forward-star: первое ребро узла, дальше по [nextEdge]. */
        val head: IntArray,
        val nextEdge: IntArray,
        val edgeTo: IntArray,
        /**
         * Во что ребро обходится ВЕЛОСИПЕДУ: длина × множитель класса дороги ([CLASS_COST]).
         * Настоящая длина рядом не лежит намеренно — её считают по геометрии готового пути
         * (`RandomPathGeometry.lengthMeters`), и вторая копия тех же метров в графе означала бы
         * лишний массив на сотни тысяч рёбер и второй источник правды о длине.
         */
        val edgeCost: FloatArray,
    ) {
        val size: Int get() = latMicro.size
    }

    private val data: Data? by lazy { runCatching { load() }.onFailure {
        log.warn("bike route graph is unavailable: ${it.message}")
    }.getOrNull() }

    /** Есть ли граф вообще. Нет ⇒ путей не будет, но борд целый. */
    val available: Boolean get() = data != null

    fun point(node: Int): GeoPoint {
        val d = data ?: error("graph unavailable")
        return GeoPoint(d.latMicro[node] / 1e6, d.lonMicro[node] / 1e6)
    }

    /**
     * Ближайший узел графа к точке. Линейный проход: 200k сравнений — доли миллисекунды, а
     * пространственный индекс здесь только добавил бы кода, который нечем оправдать.
     */
    fun nearest(p: GeoPoint): Int? {
        val d = data ?: return null
        val lat = (p.lat * 1e6).toInt()
        val lon = (p.lon * 1e6).toInt()
        // Долготу сжимаем по широте, иначе «ближайший» врал бы: градус долготы в Москве вдвое короче.
        val kx = cos(Math.toRadians(p.lat))
        var best = -1
        var bestDist = Double.MAX_VALUE
        for (i in 0 until d.size) {
            val dy = (d.latMicro[i] - lat).toDouble()
            val dx = (d.lonMicro[i] - lon).toDouble() * kx
            val dist = dx * dx + dy * dy
            if (dist < bestDist) {
                bestDist = dist
                best = i
            }
        }
        return if (best >= 0) best else null
    }

    /**
     * Кратчайший путь от узла к узлу — **A\***, а не чистая Дейкстра. На графе в 200k узлов
     * Дейкстра разворачивает пол-Москвы на каждый вызов, а пачка это до полутора десятков
     * маршрутов: разница между «кнопка отвечает мгновенно» и «кнопка думает пару секунд».
     * Эвристика — расстояние по прямой; она допустима (никогда не завышает), поэтому A\* находит
     * тот же оптимум, что и Дейкстра.
     *
     * `jitter` — надбавка к цене улиц на этот заход (0 = честный кратчайший). Роутер честно ищет
     * оптимум, но уже в чуть другом городе, и выбирает другие улицы: это второй источник
     * разнообразия помимо промежуточной точки. Надбавка неотрицательна, поэтому эвристика
     * остаётся допустимой и с ней.
     *
     * Рабочие структуры — локальные карты, а не массивы на весь граф: A\* трогает тысячи узлов
     * из двухсот тысяч, и заодно метод остаётся безопасным при одновременных запросах.
     */
    fun route(from: Int, to: Int, jitter: Double = 0.0, seed: Int = 0): List<Int>? {
        val d = data ?: return null
        if (from == to) return listOf(from)

        val dist = HashMap<Int, Double>()
        val prev = HashMap<Int, Int>()
        val done = HashSet<Int>()
        val queue = PriorityQueue<DoubleArray>(compareBy { it[0] })

        dist[from] = 0.0
        queue += doubleArrayOf(heuristic(d, from, to), from.toDouble())

        while (queue.isNotEmpty()) {
            val top = queue.poll()
            val u = top[1].toInt()
            if (!done.add(u)) continue
            if (u == to) break
            val du = dist[u] ?: continue

            var e = d.head[u]
            while (e != -1) {
                val v = d.edgeTo[e]
                if (v !in done) {
                    var w = d.edgeCost[e].toDouble()
                    if (jitter > 0.0) w *= 1.0 + jitter * noise(e shr 1, seed)
                    val nd = du + w
                    if (nd < (dist[v] ?: Double.MAX_VALUE)) {
                        dist[v] = nd
                        prev[v] = u
                        queue += doubleArrayOf(nd + heuristic(d, v, to), v.toDouble())
                    }
                }
                e = d.nextEdge[e]
            }
        }

        if (to !in dist) return null
        val path = ArrayList<Int>()
        var cur = to
        while (true) {
            path += cur
            cur = prev[cur] ?: break
        }
        path.reverse()
        return path
    }

    /** Ломаная пути точками — то, что уезжает на фронт. */
    fun points(path: List<Int>): List<GeoPoint> = path.map { point(it) }

    private fun heuristic(d: Data, a: Int, b: Int): Double {
        val kx = cos(Math.toRadians(d.latMicro[a] / 1e6))
        val dy = (d.latMicro[a] - d.latMicro[b]) / 1e6 * METERS_PER_DEGREE
        val dx = (d.lonMicro[a] - d.lonMicro[b]) / 1e6 * kx * METERS_PER_DEGREE
        return sqrt(dx * dx + dy * dy)
    }

    /** Дешёвый детерминированный шум на ребро: один seed воспроизводит один «другой город». */
    private fun noise(edge: Int, seed: Int): Double {
        var x = (edge * -1640531527) xor (seed * 40503)
        x = x xor (x ushr 16)
        x *= -1028477387
        x = x xor (x ushr 13)
        return (x.toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
    }

    private fun load(): Data {
        val stream: InputStream = javaClass.classLoader.getResourceAsStream(RESOURCE)
            ?: throw IllegalStateException("resource $RESOURCE not found")
        DataInputStream(GZIPInputStream(stream.buffered())).use { input ->
            val magic = ByteArray(4)
            input.readFully(magic)
            check(String(magic) == "DWG2") { "bad graph magic: ${String(magic)}" }

            val nodeCount = readVarInt(input)
            val latMicro = IntArray(nodeCount)
            val lonMicro = IntArray(nodeCount)
            var lat = 0
            var lon = 0
            for (i in 0 until nodeCount) {
                lat += unzigzag(readVarInt(input))
                lon += unzigzag(readVarInt(input))
                latMicro[i] = lat
                lonMicro[i] = lon
            }

            val wayCount = readVarInt(input)
            val ways = ArrayList<IntArray>(wayCount)
            val wayClass = IntArray(wayCount)
            var edgeCount = 0
            for (w in 0 until wayCount) {
                wayClass[w] = readVarInt(input)
                val refs = readVarInt(input)
                val seq = IntArray(refs)
                var idx = 0
                for (r in 0 until refs) {
                    idx += unzigzag(readVarInt(input))
                    seq[r] = idx
                }
                ways += seq
                edgeCount += (refs - 1) * 2
            }

            val head = IntArray(nodeCount) { -1 }
            val nextEdge = IntArray(edgeCount)
            val edgeTo = IntArray(edgeCount)
            val edgeCost = FloatArray(edgeCount)
            var e = 0
            for ((w, seq) in ways.withIndex()) {
                val cost = CLASS_COST.getOrElse(wayClass[w]) { 1.0f }
                for (i in 0 until seq.size - 1) {
                    val a = seq[i]
                    val b = seq[i + 1]
                    val len = segmentMeters(latMicro, lonMicro, a, b)
                    // Оба направления: односторонние улицы велосипеду в Москве не догма,
                    // а полосы и дворы в графе всё равно двусторонние.
                    edgeTo[e] = b; edgeCost[e] = len * cost
                    nextEdge[e] = head[a]; head[a] = e; e++
                    edgeTo[e] = a; edgeCost[e] = len * cost
                    nextEdge[e] = head[b]; head[b] = e; e++
                }
            }
            // Рёбра в логе не для красоты: граф лежит в памяти примитивными массивами, и его
            // вес считается именно по ним. Ориентир: узел стоит 8 байт, ребро — 12.
            val heapMb = (nodeCount.toLong() * 8 + edgeCount.toLong() * 12) / 1_000_000
            log.info("bike route graph loaded: $nodeCount nodes, ${ways.size} ways, $edgeCount edges (~$heapMb MB)")
            return Data(latMicro, lonMicro, head, nextEdge, edgeTo, edgeCost)
        }
    }

    private fun segmentMeters(lat: IntArray, lon: IntArray, a: Int, b: Int): Float {
        val kx = cos(Math.toRadians(lat[a] / 1e6))
        val dy = (lat[a] - lat[b]) / 1e6 * METERS_PER_DEGREE
        val dx = (lon[a] - lon[b]) / 1e6 * kx * METERS_PER_DEGREE
        return sqrt(dx * dx + dy * dy).toFloat()
    }

    private fun readVarInt(input: DataInputStream): Int {
        var result = 0
        var shift = 0
        while (true) {
            val b = input.read()
            if (b < 0) throw EOFException("truncated graph")
            result = result or ((b and 0x7F) shl shift)
            if (b and 0x80 == 0) return result
            shift += 7
        }
    }

    private fun unzigzag(v: Int): Int = (v ushr 1) xor -(v and 1)

    private companion object {
        const val RESOURCE = "bike/moscow-bike-graph.bin.gz"

        /**
         * Во сколько раз метр по дороге этого класса «дороже» метра по велодорожке. Порядок
         * классов задаёт сборщик графа (`CLASS_ORDER` в `backend/tools/build-bike-graph.py`):
         * велодорожка · двор/переулок · районная улица · проспект · тротуар и тропа.
         *
         * Множители нужны, чтобы путь был велосипедным, а не «кратчайшим для кого угодно»:
         * без них роутер одинаково охотно вёл и по велодорожке, и по осевой Садового.
         * ⚠️ Ни один множитель не меньше единицы — иначе прямая перестала бы быть нижней
         * оценкой цены, и A\* с ней нашёл бы не оптимум (эвристика обязана не завышать).
         * Тротуары и тропы дороги, но НЕ запретны: без них в парке рисовались бы два пути
         * вдоль дорог и ни одного через сам парк.
         */
        val CLASS_COST = floatArrayOf(1.0f, 1.1f, 1.2f, 1.35f, 1.3f)
        const val METERS_PER_DEGREE = 111_320.0
    }
}
