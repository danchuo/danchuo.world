package world.danchuo.projects

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Order of the public project list (PRD §5.7): ongoing on top, finished below; inside a group,
 * newest by the range's start, ties broken by sortOrder. The pure [ProjectRepository.ORDERING].
 */
class ProjectOrderingTest {

    private fun project(
        title: String,
        startYear: Int,
        startQuarter: Int? = null,
        endYear: Int? = null,
        endQuarter: Int? = null,
        sortOrder: Int = 0,
    ): Project = Project().also {
        it.title = title
        it.startYear = startYear
        it.startQuarter = startQuarter
        it.endYear = endYear
        it.endQuarter = endQuarter
        it.sortOrder = sortOrder
    }

    @Test
    fun `ongoing project stays above a finished one even if the finished started later`() {
        val ongoing = project("danchuo.world", 2026, 1, sortOrder = 10)
        val finished = project("proxemics", 2026, 2, endYear = 2026, endQuarter = 2, sortOrder = 20)

        val ordered = listOf(finished, ongoing).sortedWith(ProjectRepository.ORDERING)

        assertEquals(listOf("danchuo.world", "proxemics"), ordered.map { it.title })
    }

    @Test
    fun `inside a group newest start goes first, ties fall back to sortOrder`() {
        val older = project("old", 2025, 3, endYear = 2025, endQuarter = 4)
        val newer = project("new", 2026, 1, endYear = 2026, endQuarter = 1)
        val tieA = project("tie-a", 2026, 2, endYear = 2026, endQuarter = 2, sortOrder = 10)
        val tieB = project("tie-b", 2026, 2, endYear = 2026, endQuarter = 2, sortOrder = 20)

        val ordered = listOf(older, tieB, newer, tieA).sortedWith(ProjectRepository.ORDERING)

        assertEquals(listOf("tie-a", "tie-b", "new", "old"), ordered.map { it.title })
    }
}
