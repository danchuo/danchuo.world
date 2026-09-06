package world.danchuo.projects

/**
 * Публичная проекция проекта (`GET /api/projects`, PRD §5.7). Отдаём сырые числа диапазона —
 * человекочитаемую форму «Q3 2025 — наст.» собирает фронт (презентация — не на бэке).
 */
data class ProjectView(
    val iconUrl: String?,
    val title: String,
    val description: String?,
    val startYear: Int,
    val startQuarter: Int?,
    val endYear: Int?,
    val endQuarter: Int?,
    val url: String?,
    /** «Дом» проекта — куда ведёт название и картинка; `null` ⇒ туда же, куда [url]. */
    val homeUrl: String?,
) {
    companion object {
        fun from(p: Project) = ProjectView(
            iconUrl = p.iconUrl,
            title = p.title,
            description = p.description,
            startYear = p.startYear,
            startQuarter = p.startQuarter,
            endYear = p.endYear,
            endQuarter = p.endQuarter,
            url = p.url,
            homeUrl = p.homeUrl,
        )
    }
}
