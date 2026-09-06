package world.danchuo.projects

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table

/**
 * Проект с привязкой к временно́му промежутку (PRD §5.7, §7) — data-driven сущность.
 *
 * Наполняется сидом/API; новый проект = запись, без релиза. Диапазон хранится числами
 * (год + квартал начала/конца); человекочитаемую форму «Q3 2025 — наст.» собирает фронт.
 * [endYear]/[endQuarter] = `null` ⇒ «по настоящее». [url] опционален: есть ⇒ название
 * кликабельно, нет ⇒ просто текст (не «мёртвая» ссылка).
 */
@Entity
@Table(name = "project")
class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(name = "icon_url")
    var iconUrl: String? = null

    /**
     * Объёмная планета проекта — файл 3D-модели (`.glb`/`.gltf`, DESIGN §12.5). Живёт ОТДЕЛЬНО
     * от [iconUrl], а не вместо него: плоский спрайт остаётся у проекта навсегда, потому что
     * носить объём вправе не всякая волна (старые волны показывают спрайт). Что надеть,
     * решает волна раскладкой, а не эта запись; `null` ⇒ объёмной версии у проекта нет.
     */
    @Column(name = "model_url")
    var modelUrl: String? = null

    @Column(nullable = false)
    lateinit var title: String

    @Column
    var description: String? = null

    @Column(name = "start_year", nullable = false)
    var startYear: Int = 0

    /** Квартал начала (1–4); `null`, если только год. */
    @Column(name = "start_quarter")
    var startQuarter: Int? = null

    /** Год конца; `null` (+ [endQuarter] null) = «по настоящее». */
    @Column(name = "end_year")
    var endYear: Int? = null

    @Column(name = "end_quarter")
    var endQuarter: Int? = null

    /** Ссылка, которую блок ПОКАЗЫВАЕТ строкой (путь репозитория/сайта). */
    @Column
    var url: String? = null

    /**
     * «Дом» проекта — куда ведёт сам предмет (название и картинка), если это НЕ то место,
     * путь которого показан строкой: у proxemics код лежит в репозитории, а сам проект живёт
     * ботом в телеграме. `null` ⇒ дома отдельно нет, и предмет ведёт туда же, куда путь.
     */
    @Column(name = "home_url")
    var homeUrl: String? = null

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
