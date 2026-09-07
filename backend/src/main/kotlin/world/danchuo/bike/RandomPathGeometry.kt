package world.danchuo.bike

import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** Точка на карте в градусах. Долгота второй — как во всём слайсе (`startLat`/`startLon`). */
data class GeoPoint(val lat: Double, val lon: Double)

/**
 * Чистая геометрия «случайного пути» Велобайка (PRD §9 B4): всё, что считается без сети и БД.
 * Оркестровка и вызовы роутера — в [RandomPathService], здесь только математика, поэтому она
 * целиком под тестами.
 *
 * Идея механики: у поездки нет трека (API Велобайка отдаёт лишь старт и финиш), и кнопка рисует
 * **придуманный** путь по настоящим улицам. Чтобы выдумка оставалась правдоподобной, её длина
 * держится в коридоре [оптимум, оптимум × [CORRIDOR]] — короче оптимума пути не бывает, поэтому
 * коридор только вверх.
 *
 * Разнообразие берётся из промежуточной точки, а точка — **с эллипса** с фокусами в старте и
 * финише ([waypointOnEllipse]). Сумма расстояний до фокусов на эллипсе постоянна, поэтому крюк
 * задаётся заранее числом, а случаен только угол. Бросать точку внутрь эллипса нельзя: она липнет
 * к прямой старт→финиш, и почти все пути выходят одинаковыми (замерено на прототипе — из десяти
 * бросков девять давали +8..10%).
 */
object RandomPathGeometry {

    /** Потолок коридора: путь не длиннее оптимума × это. Ниже оптимума роутер не опускается. */
    const val CORRIDOR = 1.4

    /** Сколько длины новый бросок вправе делить с предыдущим, прежде чем считаться его копией. */
    const val MAX_OVERLAP = 0.45

    /** На сколько метров звено должно разойтись с чужим, чтобы считаться другой улицей. */
    const val OVERLAP_TOLERANCE_METERS = 25.0

    private const val METERS_PER_DEGREE = 111_320.0

    /**
     * Расстояние по прямой. Плоская аппроксимация: в пределах города ошибка против гаверсинуса
     * доли процента, а вся механика оперирует долями от оптимума — точности хватает с запасом.
     */
    fun distanceMeters(a: GeoPoint, b: GeoPoint): Double {
        val midLat = Math.toRadians((a.lat + b.lat) / 2)
        val dx = (b.lon - a.lon) * cos(midLat) * METERS_PER_DEGREE
        val dy = (b.lat - a.lat) * METERS_PER_DEGREE
        return hypot(dx, dy)
    }

    /** Длина ломаной. Пустая или из одной точки — ноль. */
    fun lengthMeters(path: List<GeoPoint>): Double {
        var sum = 0.0
        for (i in 0 until path.size - 1) sum += distanceMeters(path[i], path[i + 1])
        return sum
    }

    /**
     * Точка **на** эллипсе с фокусами `a` и `b`, у которого большая ось = |ab| × [detour].
     * `angleRad` — параметр обхода эллипса: он и есть источник случайности, тогда как крюк
     * задан числом. Противоположные углы дают точки по разные стороны от прямой — на этом
     * и держится правило «два подряд броска рядом не лягут».
     */
    fun waypointOnEllipse(a: GeoPoint, b: GeoPoint, detour: Double, angleRad: Double): GeoPoint {
        val midLat = Math.toRadians((a.lat + b.lat) / 2)
        val cosLat = cos(midLat)
        // Локальный метрический кадр с началом в `a`: плоскость, метры.
        val bx = (b.lon - a.lon) * cosLat * METERS_PER_DEGREE
        val by = (b.lat - a.lat) * METERS_PER_DEGREE
        val straight = hypot(bx, by)
        if (straight < 1.0) return a

        val ux = bx / straight
        val uy = by / straight
        val semiMajor = straight * detour / 2
        // Полуось всегда не меньше половины фокусного расстояния: detour < 1 физически невозможен,
        // но пришедшее из конфига число не обязано быть разумным.
        val semiMinor = sqrt(max(semiMajor * semiMajor - (straight / 2) * (straight / 2), 0.0))

        val ex = semiMajor * cos(angleRad)
        val ey = semiMinor * sin(angleRad)
        // Поворот из осей эллипса в кадр: u вдоль ab, перпендикуляр — (-uy, ux).
        val x = bx / 2 + ex * ux - ey * uy
        val y = by / 2 + ex * uy + ey * ux

        return GeoPoint(
            lat = a.lat + y / METERS_PER_DEGREE,
            lon = a.lon + x / (cosLat * METERS_PER_DEGREE),
        )
    }

    /**
     * Точка на `meters` метров от `from` по курсу `bearingRad` (0 — на север, по часовой).
     * Нужна петлям: у поездки, вернувшейся на ту же станцию, нет второго фокуса, и эллипс
     * вырождается — вместо него вокруг станции ставится треугольник по случайному курсу.
     */
    fun pointAtBearing(from: GeoPoint, meters: Double, bearingRad: Double): GeoPoint {
        val dy = meters * cos(bearingRad)
        val dx = meters * sin(bearingRad)
        val cosLat = cos(Math.toRadians(from.lat))
        return GeoPoint(
            lat = from.lat + dy / METERS_PER_DEGREE,
            lon = from.lon + dx / (cosLat * METERS_PER_DEGREE),
        )
    }

    /** Влезает ли путь в коридор. Верхняя граница с запасом в метр — против дребезга округления. */
    fun withinCorridor(lengthMeters: Double, optimumMeters: Double): Boolean {
        if (optimumMeters <= 0.0) return true
        return lengthMeters <= optimumMeters * CORRIDOR + 1.0
    }

    /**
     * Какая доля длины `path` идёт по тем же улицам, что `previous`. Считаем по звеньям: звено
     * общее, если его середина лежит ближе [OVERLAP_TOLERANCE_METERS] к какому-нибудь звену
     * предыдущего пути. Сравнение геометрическое, а не по идентификаторам улиц, — роутер отдаёт
     * ломаную, а не рёбра графа.
     *
     * Ноль недостижим на практике: со станции выезжаешь по одним и тем же переулкам. Поэтому порог
     * ([MAX_OVERLAP]) — доля, а не «ни одного общего метра».
     */
    fun overlapFraction(
        path: List<GeoPoint>,
        previous: List<GeoPoint>,
        toleranceMeters: Double = OVERLAP_TOLERANCE_METERS,
    ): Double {
        if (path.size < 2 || previous.size < 2) return 0.0
        var shared = 0.0
        var total = 0.0
        for (i in 0 until path.size - 1) {
            val p = path[i]
            val q = path[i + 1]
            val len = distanceMeters(p, q)
            total += len
            val mid = GeoPoint((p.lat + q.lat) / 2, (p.lon + q.lon) / 2)
            if (nearAnySegment(mid, previous, toleranceMeters)) shared += len
        }
        return if (total > 0.0) shared / total else 0.0
    }

    private fun nearAnySegment(point: GeoPoint, path: List<GeoPoint>, tolerance: Double): Boolean {
        for (i in 0 until path.size - 1) {
            if (distanceToSegmentMeters(point, path[i], path[i + 1]) <= tolerance) return true
        }
        return false
    }

    /** Расстояние от точки до отрезка — в том же плоском метрическом приближении. */
    private fun distanceToSegmentMeters(p: GeoPoint, a: GeoPoint, b: GeoPoint): Double {
        val cosLat = cos(Math.toRadians(p.lat))
        val px = (p.lon - a.lon) * cosLat * METERS_PER_DEGREE
        val py = (p.lat - a.lat) * METERS_PER_DEGREE
        val bx = (b.lon - a.lon) * cosLat * METERS_PER_DEGREE
        val by = (b.lat - a.lat) * METERS_PER_DEGREE
        val lenSq = bx * bx + by * by
        if (lenSq < 1e-6) return hypot(px, py)
        val t = min(1.0, max(0.0, (px * bx + py * by) / lenSq))
        return hypot(px - bx * t, py - by * t)
    }
}
