package world.danchuo.theme

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant

/**
 * Волна (PRD §5.9, §7; DESIGN §10) — именованный визуальный стиль. Все визуальные значения
 * лежат в [tokens] (JSONB), фронт инжектит их в `:root` (`--<ключ>`). Смена активной волны
 * меняет весь сайт **без правок компонентов**.
 *
 * Data-driven: новая волна = новая запись. Ровно одна [active] (default владельца); фронтовый
 * переключатель может показать любую волну из БД (запись = факт релиза, [releasedAt] — его
 * момент и порядок в ряду свотчей), своп токенов клиентский.
 *
 * [tokens] хранит **только визуальную палитру** (цвет/глубина/радиусы/декор), ключи без
 * префикса `--` (фронт добавляет). Шрифты сюда НЕ кладём — их подставляет `next/font`.
 */
@Entity
@Table(name = "theme")
class Theme {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Стабильный машинный ключ волны (`wave-01`), уникален. */
    @Column(nullable = false, unique = true)
    lateinit var key: String

    @Column(nullable = false)
    lateinit var name: String

    /** Design tokens волны: `{ "bg-page": "#faf1eb", … }`. Сериализуется в jsonb. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    lateinit var tokens: Map<String, String>

    /**
     * Layout-блок волны (DESIGN §3, §10): переопределяет дефолтную bento-раскладку фронта
     * (переставить/ресайзить/спрятать тайлы, сменить размер грида и порядок стека). `null` ⇒
     * фронт берёт дефолт `layout.ts`. Бэкенд хранит как непрозрачный JSON, не интерпретирует.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    var layout: LayoutSpec? = null

    /** Ровно одна волна активна (default отображения). */
    @Column(nullable = false)
    var active: Boolean = false

    /** Когда волна выпущена; в переключателе показываются только выпущенные. */
    @Column(name = "released_at", nullable = false)
    lateinit var releasedAt: Instant
}
