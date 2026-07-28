package world.danchuo.social

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate

/**
 * Артефакт бегущей строки (PRD §5.8, §7; DESIGN §7.2) — предмет с картинкой/GIF и подписью.
 *
 * [firstMentionedOn] **хранится всегда**, но в UI выводится только в ховер-поповере (не в
 * самой marquee). [model3dUrl] — задел бэклога (3D-артефакты, §9), M4 не заполняет.
 * Data-driven: новый артефакт = запись; порядок — [sortOrder].
 */
@Entity
@Table(name = "artifact")
class Artifact {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    @Column(nullable = false)
    lateinit var name: String

    /** Картинка/GIF (PNG/GIF) — статика фронта/сторадж; `null` ⇒ артефакт без картинки. */
    @Column(name = "image_url")
    var imageUrl: String? = null

    /** Дата первого упоминания (§5.8): в UI — только в поповере. */
    @Column(name = "first_mentioned_on", nullable = false)
    lateinit var firstMentionedOn: LocalDate

    /** Задел бэклога (§9): 3D-модель артефакта; M4 не заполняет. */
    @Column(name = "model_3d_url")
    var model3dUrl: String? = null

    /**
     * Можно ли класть предмет набок, когда лента идёт поперёк его длинной стороны
     * (DESIGN §7.2). Свойство самого предмета, а не его пропорции: у очков и мыльницы
     * есть «правильная сторона», у ракетки её нет. По умолчанию — нельзя: новый артефакт
     * показывается ровно так, как нарисован.
     */
    @Column(name = "rotatable", nullable = false)
    var rotatable: Boolean = false

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0
}
