package world.danchuo.spotify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Куда резать аудио, чтобы расшифровать прослушанный кусок (PRD §5.16.1).
 *
 * **Режем ДО расшифровки, а не после.** Замер: минута речи даёт 767 знаков, то есть часовой
 * заход — 46 тысяч против потолка выдержки в 12 тысяч. Расшифровывать час целиком значило бы
 * заплатить аудиосекундами за текст, который всё равно будет выброшен нарезкой окон. Четыре
 * окна по паре минут стоят вдесятеро дешевле и отвечают на тот же вопрос.
 *
 * **Смещение считается долей, а не миллисекундами.** У шоу с динамической вставкой рекламы
 * (megaphone) длительность в RSS расходится со Spotify — у Huberman замерено 7707 с против
 * 7692.5 с. Доля от РЕАЛЬНОГО размера файла гасит этот дрейф, абсолютные миллисекунды его
 * копят к концу выпуска.
 *
 * Байт и время связаны линейно, потому что все шесть проверенных фидов отдают **CBR mp3**
 * (96–320 kbps). Это же снимает нужду в ffmpeg: срез с произвольного байта — валидный поток,
 * декодер ресинхронизируется на первом же заголовке фрейма (замер: 137–381 байт).
 */
class AudioWindowsTest {

    /** Часовой выпуск на 128 kbps: 16 000 байт в секунду. */
    private val duration = 3_600_000L
    private val total = 57_600_000L

    @Test
    fun `a short stretch is taken whole, without gaps`() {
        // Три минуты влезают в одно окно целиком — рвать их на четыре куска незачем.
        val windows = windows(from = 0.0, to = 180_000.0 / duration)

        assertEquals(1, windows.size)
        assertEquals(0L, windows.first().from)
        assertTrue(windows.first().to in 2_870_000..2_890_000, "≈180 с при 16 КБ/с: ${windows.first()}")
    }

    @Test
    fun `a long stretch is sampled across its whole length`() {
        val windows = windows(from = 0.0, to = 1.0)

        assertEquals(4, windows.size)
        // Окна идут по возрастанию и не перекрываются — иначе модель получила бы один кусок дважды.
        windows.zipWithNext().forEach { (a, b) -> assertTrue(a.to < b.from, "окна перекрылись: $a и $b") }
    }

    @Test
    fun `the last window ends where listening stopped`() {
        // Место, где владелец выключил, — самое памятное; обрезка «по началу» молчала бы именно
        // про него (то же правило, что у SummaryWindows для текста).
        val to = 0.5
        val windows = windows(from = 0.0, to = to)

        assertEquals((to * total).toLong() - 1, windows.last().to)
    }

    @Test
    fun `windows never run past the file`() {
        val windows = windows(from = 0.9, to = 1.5)

        assertTrue(windows.all { it.to < total }, "вылезли за файл: $windows")
        assertTrue(windows.all { it.from >= 0 }, "ушли левее нуля: $windows")
    }

    @Test
    fun `an empty or inverted stretch gives nothing to cut`() {
        assertTrue(windows(from = 0.5, to = 0.5).isEmpty())
        assertTrue(windows(from = 0.7, to = 0.3).isEmpty())
    }

    @Test
    fun `a file we know nothing about gives nothing to cut`() {
        // Нулевая длительность или нулевой размер — делить не на что; молчим, а не падаем.
        assertTrue(AudioWindows.windows(0, duration, 0.0, 1.0, COUNT, WINDOW_MS).isEmpty())
        assertTrue(AudioWindows.windows(total, 0, 0.0, 1.0, COUNT, WINDOW_MS).isEmpty())
    }

    @Test
    fun `the whole cut stays inside the budget of one free lane tick`() {
        // Четыре окна по три минуты — 720 аудиосекунд на заход при лимите 7200 в час.
        val seconds = windows(from = 0.0, to = 1.0)
            .sumOf { (it.to - it.from + 1) } * duration / total / 1000

        assertTrue(seconds in 700..740, "бюджет окна уехал: $seconds с")
    }

    private fun windows(from: Double, to: Double) =
        AudioWindows.windows(total, duration, from, to, COUNT, WINDOW_MS)

    private companion object {
        const val COUNT = 4
        const val WINDOW_MS = 180_000L
    }
}
