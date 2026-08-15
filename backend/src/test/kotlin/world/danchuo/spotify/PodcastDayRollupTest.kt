package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Свёртка суток в отметки и карточки (PRD §5.6). Два разных вопроса, и считаются они по-разному:
 * - **галочки** — по СУММЕ минут за сутки, без оглядки на эпизоды: каждые полные 25 минут
 *   закрывают одну остановку пункта. Только так переживают оба реальных сценария владельца —
 *   «два эпизода по 40 минут» и «один двухчасовой, половина туда, половина обратно»;
 * - **карточки** — по ЗАХОДАМ: первые два захода дня, каждый из которых перевалил сумму через
 *   очередную полную 25-минутку.
 *
 * Расхождение между ними — не баг, а следствие: марафон в один присест даёт две галочки и ОДНУ
 * карточку (заход-то был один), а тот же эпизод, взятый по дороге туда и обратно, — две галочки
 * и ДВЕ карточки, потому что заходов было два.
 */
class PodcastDayRollupTest {

    private val morning: Instant = Instant.parse("2026-08-12T05:10:00Z")

    /** Ключи строк — как в БД: у каждой сессии свой, и растут они по мере записи. */
    private var nextSessionId = 1L

    /** Заход: минуты слушал подряд, начиная с [at]. Сессия из БД приезжает сюда в этой же форме. */
    private fun run(id: String, minutes: Long, at: Instant) = PodcastRun(
        sessionId = nextSessionId++,
        episodeId = id,
        listenedMs = minutes * 60_000,
        startedAt = at,
        endedAt = at.plusSeconds(minutes * 60),
        episodeName = "эпизод $id",
        episodeUrl = "https://open.spotify.com/episode/$id",
        showName = "шоу $id",
        showUrl = "https://open.spotify.com/show/$id",
        imageUrl = null,
        episodeDurationMs = null,
    )

    private fun occurrences(minutes: Long) = PodcastDayRollup.occurrences(minutes * 60_000, target = 2)

    private fun cardIds(vararg runs: PodcastRun) =
        PodcastDayRollup.cards(runs.toList(), max = 2).map { it.episodeId }

    private fun merge(vararg runs: PodcastRun, gapMinutes: Long = 45) =
        PodcastDayRollup.runs(runs.toList(), gapMinutes)

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

    // ── заходы: сессии одного эпизода, склеенные по паузе ──

    @Test
    fun `a short break keeps one run`() {
        // Порог хранения (15 мин) рвёт сессию раньше, чем человек считает прослушивание
        // прерванным: обед посреди эпизода — это тот же заход.
        val before = run("A", 20, morning)
        val after = run("A", 15, morning.plusSeconds(20 * 60 + 30 * 60))
        val merged = merge(before, after)
        assertEquals(1, merged.size)
        assertEquals(35 * 60_000L, merged.single().listenedMs)
        assertEquals(morning, merged.single().startedAt)
    }

    @Test
    fun `a glued run keeps the key of the strip it started with`() {
        // Ключ захода — это ключ его ПЕРВОЙ строки: к нему привязан пересказ прослушанного
        // (§5.16.1), и приклеенный следом кусок не должен уводить его на другую строку.
        val before = run("A", 20, morning)
        val after = run("A", 15, morning.plusSeconds(20 * 60 + 30 * 60))

        assertEquals(before.sessionId, merge(before, after).single().sessionId)
        // Порядок аргументов роли не играет: склейка идёт по времени, а не по вызову.
        assertEquals(before.sessionId, merge(after, before).single().sessionId)
    }

    @Test
    fun `a long break splits the runs`() {
        val there = run("A", 45, morning)
        val back = run("A", 35, morning.plusSeconds(10 * 3600))
        assertEquals(2, merge(there, back).size)
    }

    @Test
    fun `different episodes never merge even back to back`() {
        val first = run("A", 20, morning)
        val second = run("B", 20, morning.plusSeconds(20 * 60))
        assertEquals(listOf("A", "B"), merge(first, second).map { it.episodeId })
    }

    @Test
    fun `runs come out in chronological order`() {
        val evening = run("B", 30, morning.plusSeconds(10 * 3600))
        val early = run("A", 30, morning)
        assertEquals(listOf("A", "B"), merge(evening, early).map { it.episodeId })
    }

    // ── карточки: заходы, перевалившие сумму через очередную 25-минутку ──

    @Test
    fun `one episode taken there and back gives two cards`() {
        // Главный кейс владельца: 80 минут одного эпизода двумя заходами — две остановки
        // и ДВЕ карточки, потому что заходов правда было два.
        val there = run("A", 45, morning)
        val back = run("A", 35, morning.plusSeconds(10 * 3600))
        assertEquals(listOf("A", "A"), cardIds(there, back))
        assertEquals(2, occurrences(80))
    }

    @Test
    fun `one long sitting gives a single card even though it closes both stops`() {
        val long = run("A", 120, morning)
        assertEquals(listOf("A"), cardIds(long))
        assertEquals(2, occurrences(120))
    }

    @Test
    fun `two qualifying runs give two cards ordered by when they started`() {
        val evening = run("B", 40, morning.plusSeconds(10 * 3600))
        val early = run("A", 40, morning)
        assertEquals(listOf("A", "B"), cardIds(evening, early))
    }

    @Test
    fun `a run poked and abandoned earns no card but its minutes still count`() {
        // 40 минут + 2 минуты «ткнул и бросил»: вторая остановка не закрыта вовсе (42 < 50),
        // и карточки у тычка нет — он ни одной 25-минутки не перевалил.
        val real = run("A", 40, morning)
        val poked = run("B", 2, morning.plusSeconds(3600))
        assertEquals(listOf("A"), cardIds(real, poked))
        assertEquals(1, occurrences(42))
    }

    @Test
    fun `a fragmented day still fills both stops`() {
        // Четыре куска по 20 минут: ни один сам по себе порога не берёт, но 25-ю и 50-ю
        // минуту дня кто-то из них перевалил — эти двое и получают карточки.
        val runs = listOf(
            run("A", 20, morning),
            run("B", 20, morning.plusSeconds(2 * 3600)),
            run("C", 20, morning.plusSeconds(4 * 3600)),
            run("D", 20, morning.plusSeconds(6 * 3600)),
        )
        assertEquals(listOf("B", "C"), PodcastDayRollup.cards(runs, max = 2).map { it.episodeId })
    }

    @Test
    fun `a marathon day shows the first two, not the longest`() {
        val first = run("A", 30, morning)
        val second = run("B", 30, morning.plusSeconds(3600))
        val longest = run("C", 90, morning.plusSeconds(7200))
        assertEquals(listOf("A", "B"), cardIds(first, second, longest))
    }

    @Test
    fun `nothing qualifying gives no cards`() {
        assertEquals(emptyList<String>(), cardIds(run("A", 10, morning)))
    }

    @Test
    fun `listened minutes floor to whole minutes`() {
        assertEquals(49, PodcastDayRollup.listenedMinutes(2_999_000))
    }
}
