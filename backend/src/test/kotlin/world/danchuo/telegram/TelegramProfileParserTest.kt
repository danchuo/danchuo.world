package world.danchuo.telegram

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Разбор публичной страницы `t.me/{username}` (PRD §5.18).
 *
 * Канал — **HTML, а не API**: открытого эндпоинта «дай карточку пользователя» у Telegram нет
 * (Bot API отдаёт только тех, кто написал боту, а MTProto требует заведённого приложения и
 * сессии). Страница-визитка отдаёт имя, статус и аватар анониму и без ключа — тем же способом,
 * что фрагмент календаря вкладов GitHub.
 *
 * Читаем **og-разметку**, а не саму вёрстку: превью-теги живут ради чужих превьюшек (мессенджеры,
 * поисковики), поэтому меняются реже классов, которыми страница рисует себя. Исключение одно —
 * `@ник` из `tgme_page_extra`: в og его нет вовсе.
 *
 * Контракт деградации тот же, что у вкладов: **не понял — не отдал**. `null` наверх означает
 * «показывать нечего», и карточка просто не появляется — вместо правдоподобной визитки с пустым
 * именем.
 */
class TelegramProfileParserTest {

    /** Живая страница `t.me/danchuo`, снятая 14.09.2026 — только то, что читает разбор. */
    private fun page(
        title: String = "Данила",
        description: String? = "keep",
        image: String? = "https://cdn4.telesco.pe/file/A-bM.jpg",
        extra: String? = "@danchuo",
    ) = buildString {
        append("""<meta property="og:title" content="$title">""")
        append("""<meta property="og:site_name" content="Telegram">""")
        if (description != null) append("""<meta property="og:description" content="$description">""")
        if (image != null) append("""<meta property="og:image" content="$image">""")
        append("""<meta name="twitter:title" content="не отсюда">""")
        append("""<div class="tgme_page_title"><span dir="auto">$title</span></div>""")
        if (extra != null) append("""<div class="tgme_page_extra">\n  $extra\n</div>""")
    }

    @Test
    fun `собирает визитку из og-разметки страницы`() {
        val profile = TelegramProfileParser.parse(page(), fallbackUsername = "danchuo")!!

        assertEquals("Данила", profile.name)
        assertEquals("danchuo", profile.username)
        assertEquals("keep", profile.bio)
        assertEquals("https://cdn4.telesco.pe/file/A-bM.jpg", profile.avatarUrl)
    }

    /**
     * `og:title` и `twitter:title` лежат рядом и несут одно и то же — берём именно og:
     * иначе порядок тегов на странице решал бы, чьё значение доедет.
     */
    @Test
    fun `берёт og-теги, а не соседние twitter`() {
        val html = """<meta name="twitter:title" content="чужое"><meta property="og:title" content="Данила">"""
        assertEquals("Данила", TelegramProfileParser.parse(html, "danchuo")?.name)
    }

    /** Пустой статус — законное состояние аккаунта: визитка рисуется, строки просто нет. */
    @Test
    fun `аккаунт без статуса остаётся визиткой`() {
        val profile = TelegramProfileParser.parse(page(description = null), "danchuo")!!
        assertNull(profile.bio)
        assertEquals("Данила", profile.name)
    }

    /** Аватара может не быть (пустой профиль) — имя и ник карточку уже наполняют. */
    @Test
    fun `аккаунт без аватара остаётся визиткой`() {
        assertNull(TelegramProfileParser.parse(page(image = null), "danchuo")?.avatarUrl)
    }

    /**
     * Ника в og-разметке нет вовсе, поэтому он читается из вёрстки. Уедет и она — остаётся
     * тот, по которому мы ходили: он заведомо верен, ведь страницу отдали именно по нему.
     */
    @Test
    fun `ник без собаки, а при поехавшей вёрстке — тот, по которому ходили`() {
        assertEquals("danchuo", TelegramProfileParser.parse(page(extra = "@danchuo"), "danchuo")?.username)
        assertEquals("danchuo", TelegramProfileParser.parse(page(extra = null), "danchuo")?.username)
    }

    /** Имя приезжает экранированным — в карточке должны стоять настоящие символы. */
    @Test
    fun `разэкранирует html-сущности в имени и статусе`() {
        val profile = TelegramProfileParser.parse(
            page(title = "Дан &amp; Ко", description = "&quot;keep&quot; &lt;3"),
            "danchuo",
        )!!
        assertEquals("Дан & Ко", profile.name)
        assertEquals("\"keep\" <3", profile.bio)
    }

    /**
     * Несуществующий ник Telegram отдаёт страницей-заглушкой БЕЗ `og:title` — визитки из неё
     * не собрать. Так же выглядит и любой другой сбой канала: страница ошибки, редирект,
     * поехавшая разметка.
     */
    @Test
    fun `страница без имени не даёт визитки вовсе`() {
        assertNull(TelegramProfileParser.parse("<html><body>Telegram</body></html>", "danchuo"))
        assertNull(TelegramProfileParser.parse(page(title = "   "), "danchuo"))
    }
}
