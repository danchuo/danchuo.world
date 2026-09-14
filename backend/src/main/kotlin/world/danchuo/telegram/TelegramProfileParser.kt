package world.danchuo.telegram

/**
 * Визитка владельца в Telegram — ровно то, что рисует карточка (PRD §5.18).
 *
 * [avatarUrl] — адрес CDN Telegram, а не наш: снимает байты и подменяет адрес слой выше
 * ([TelegramProfileCollector]), разбору же полагается отдать то, что написано на странице.
 */
data class TelegramProfile(
    val name: String,
    val username: String,
    val bio: String?,
    val avatarUrl: String?,
)

/**
 * Разбор публичной страницы `t.me/{username}` — чистая функция, вся хрупкость канала заперта
 * здесь (PRD §5.18).
 *
 * **Почему HTML, а не API.** Открытого эндпоинта «дай карточку пользователя» у Telegram нет:
 * Bot API видит только тех, кто сам написал боту, а MTProto требует заведённого приложения,
 * телефонной сессии и живого соединения — ради имени, статуса и аватарки. Страница-визитка
 * отдаёт всё это анониму и без ключа.
 *
 * **Читаем og-разметку, а не вёрстку.** Превью-теги существуют ради чужих превьюшек и потому
 * меняются реже, чем классы, которыми страница рисует саму себя. Форма (снята 14.09.2026):
 * ```
 * <meta property="og:title" content="Данила">
 * <meta property="og:image" content="https://cdn4.telesco.pe/file/A-bM….jpg">
 * <meta property="og:description" content="keep">
 * <div class="tgme_page_extra">@danchuo</div>
 * ```
 * Единственное, чего в og нет, — сам `@ник`; он читается из вёрстки, а не найдя — берётся тот,
 * по которому мы ходили: страницу отдали именно по нему, значит он верен.
 *
 * Разбор **пессимистичный**: атрибуты читаются по одному (порядок в теге ничего не значит),
 * непонятое молча выпадает, а страница без имени даёт `null` — «показывать нечего». Так же
 * выглядит и сбой канала: несуществующий ник, страница ошибки, поехавшая разметка.
 */
object TelegramProfileParser {

    private val META = Regex("""<meta\b[^>]*>""")
    private val PROPERTY = Regex("""\bproperty="([^"]+)"""")
    private val CONTENT = Regex("""\bcontent="([^"]*)"""")
    private val EXTRA = Regex("""<div\s+class="tgme_page_extra"\s*>([^<]*)</div>""")

    /**
     * `html` страницы → визитка. [fallbackUsername] — ник, по которому её запрашивали: им
     * закрывается дыра, если `tgme_page_extra` однажды переедет.
     */
    fun parse(html: String, fallbackUsername: String): TelegramProfile? {
        val og = ogTags(html)
        val name = og["og:title"]?.let(::unescape)?.trim().orEmpty()
        if (name.isEmpty()) return null

        return TelegramProfile(
            name = name,
            username = username(html) ?: fallbackUsername.trim().removePrefix("@"),
            bio = og["og:description"]?.let(::unescape)?.trim()?.takeIf { it.isNotEmpty() },
            avatarUrl = og["og:image"]?.let(::unescape)?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    /** `property → content` по всем `<meta>`; теги без обоих атрибутов пропускаются. */
    private fun ogTags(html: String): Map<String, String> {
        val tags = HashMap<String, String>()
        for (tag in META.findAll(html)) {
            val property = PROPERTY.find(tag.value)?.groupValues?.get(1) ?: continue
            val content = CONTENT.find(tag.value)?.groupValues?.get(1) ?: continue
            tags.putIfAbsent(property, content)
        }
        return tags
    }

    /** `@danchuo` из вёрстки → `danchuo`. Пусто или не нашли — `null`, решает вызывающий. */
    private fun username(html: String): String? =
        EXTRA.find(html)?.groupValues?.get(1)
            ?.replace("\n", " ")
            ?.trim()
            ?.takeIf { it.startsWith("@") }
            ?.removePrefix("@")
            ?.takeIf { it.isNotEmpty() }

    /**
     * Обратная замена пяти сущностей, которыми экранируются значения атрибутов. Полной таблицы
     * HTML тут не надо: Telegram кодирует именно этот набор, а имя с редкой сущностью лучше
     * покажется как есть, чем утянет за собой разбор целиком.
     */
    private fun unescape(value: String): String = value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}
