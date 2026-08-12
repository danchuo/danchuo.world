package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Свёртка суток в отметки и карточки (PRD §5.6). Два разных вопроса, и считаются они по-разному:
 * - **галочки** — по СУММЕ минут за сутки, без оглядки на эпизоды: каждые полные 25 минут
 *   закрывают одну остановку пункта. Только так переживают оба реальных сценария владельца —
 *   «два эпизода по 40 минут» и «один двухчасовой, половина туда, половина обратно»;
 * - **карточки** — поэпизодно: первые два эпизода дня (по времени начала), набравшие порог.
 *
 * Расхождение между ними — не баг, а следствие: двухчасовой эпизод даёт две галочки и ОДНУ
 * карточку, а «40 минут + ткнул и бросил» — две галочки и одну карточку.
 */
class PodcastDayRollupTest {

    private val morning: Instant = Instant.parse("2026-08-12T05:10:00Z")

    private fun listen(id: String, minutes: Long, at: Instant) = PodcastListen(
        episodeId = id,
        listenedMs = minutes * 60_000,
        firstListenedAt = at,
        episodeName = "эпизод $id",
        episodeUrl = "https://open.spotify.com/episode/$id",
        showName = "шоу $id",
        showUrl = "https://open.spotify.com/show/$id",
        imageUrl = null,
        episodeDurationMs = null,
    )

    private fun occurrences(minutes: Long) = PodcastDayRollup.occurrences(minutes * 60_000, target = 2)

    private fun cardIds(vararg listens: PodcastListen) =
        PodcastDayRollup.cards(listens.toList(), max = 2).map { it.episodeId }

    // ── галочки: min(target, floor(минуты / 25)) ──

    @Test
    fun `under the threshold closes nothing`() {
        assertEquals(0, occurrences(24))
    }

    @Test
    fun `exactly the threshold closes the first stop`() {
        assertEquals(1, occurrences(25))
    }

    @Test
    fun `forty minutes is still one podcast`() {
        assertEquals(1, occurrences(40))
    }

    @Test
    fun `forty nine minutes is still one podcast`() {
        assertEquals(1, occurrences(49))
    }

    @Test
    fun `fifty minutes is already two`() {
        assertEquals(2, occurrences(50))
    }

    @Test
    fun `a day of podcasts never exceeds the target`() {
        assertEquals(2, occurrences(300))
    }

    @Test
    fun `partial minutes below the threshold do not round up`() {
        // 49:59 — ещё один подкаст, ровно 50:00 — уже два.
        assertEquals(1, PodcastDayRollup.occurrences(2_999_000, target = 2))
        assertEquals(2, PodcastDayRollup.occurrences(3_000_000, target = 2))
    }

    // ── карточки: первые max эпизодов по времени, набравшие порог ──

    @Test
    fun `two qualifying episodes give two cards ordered by when they started`() {
        val evening = listen("B", 40, morning.plusSeconds(10 * 3600))
        val early = listen("A", 40, morning)
        assertEquals(listOf("A", "B"), cardIds(evening, early))
    }

    @Test
    fun `one long episode gives a single card even though it closes both stops`() {
        val long = listen("A", 120, morning)
        assertEquals(listOf("A"), cardIds(long))
        assertEquals(2, occurrences(120))
    }

    @Test
    fun `an episode poked and abandoned earns no card but its minutes still count`() {
        val real = listen("A", 40, morning)
        val poked = listen("B", 10, morning.plusSeconds(3600))
        assertEquals(listOf("A"), cardIds(real, poked))
        assertEquals(2, occurrences(50))
    }

    @Test
    fun `a marathon day shows the first two, not the longest`() {
        val first = listen("A", 30, morning)
        val second = listen("B", 30, morning.plusSeconds(3600))
        val longest = listen("C", 90, morning.plusSeconds(7200))
        assertEquals(listOf("A", "B"), cardIds(first, second, longest))
    }

    @Test
    fun `nothing qualifying gives no cards`() {
        assertEquals(emptyList<String>(), cardIds(listen("A", 10, morning)))
    }

    @Test
    fun `listened minutes floor to whole minutes`() {
        assertEquals(49, PodcastDayRollup.listenedMinutes(2_999_000))
    }
}
