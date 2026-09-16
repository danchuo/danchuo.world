package world.danchuo.projects

/**
 * Public project projection (`GET /api/projects`, PRD §5.7). We send the raw range numbers — the
 * readable "Q3 2025 - present" is assembled by the frontend, since presentation is not the backend's.
 */
data class ProjectView(
    val iconUrl: String?,
    /** The project's 3D planet (`.glb`) when it has one; whether to wear it is the wave's call. */
    val modelUrl: String?,
    val title: String,
    val description: String?,
    val startYear: Int,
    val startQuarter: Int?,
    val endYear: Int?,
    val endQuarter: Int?,
    val url: String?,
    /** The project's home — where the name and picture lead; `null` means the same as [url]. */
    val homeUrl: String?,
) {
    companion object {
        fun from(p: Project) = ProjectView(
            iconUrl = p.iconUrl,
            modelUrl = p.modelUrl,
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
