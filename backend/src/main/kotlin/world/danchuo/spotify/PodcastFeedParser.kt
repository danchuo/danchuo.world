package world.danchuo.spotify

/**
 * Разбор чужого подкастного RSS и выдачи каталога (PRD §5.16.1) — второе место после
 * [world.danchuo.reading.EpubText], где мы знаем чужой формат, и такое же read-only.
 *
 * Разбираем регулярками, а не XML-парсером, по той же причине, что и фрагмент профиля GitHub:
 * нам нужны три вещи (название выпуска, длительность, ссылка на аудио), а фиды в дикой природе
 * бывают невалидны ровно настолько, чтобы строгий парсер отказался читать всё целиком. Битый
 * фид обязан стоить одного пропущенного пересказа, а не исключения в поллере.
 *
 * **Главный риск здесь — не «не нашли», а «нашли не тот».** Пропущенный выпуск стоит
 * отсутствующей кнопки; чужой — уверенного пересказа под карточкой, и отличить его на странице
 * будет нечем. Поэтому ключей два — название И длительность, — а при любом сомнении мы молчим.
 */
object PodcastFeedParser {

    /**
     * Допуск на расхождение длительности, долей. Два процента: у шоу с динамической вставкой
     * рекламы длительность в фиде и в Spotify не совпадают в принципе (замерено 7707 с против
     * 7692.5 с у Huberman), а вдвое разошедшийся выпуск — это уже другой выпуск.
     */
    const val DURATION_TOLERANCE = 0.02

    /**
     * Фид шоу по его названию из плеера. Совпадение ищем **точное** и только потом
     * приблизительное: у популярных шоу есть спутники-тёзки («Hidden Brain Plus»), они стоят в
     * выдаче выше и содержат ДРУГИЕ выпуски.
     */
    fun feedUrlFor(results: List<ItunesShow>, showName: String): String? {
        val wanted = normalise(showName)
        if (wanted.isEmpty()) return null
        val withFeed = results.filter { !it.feedUrl.isNullOrBlank() }
        return (
            withFeed.firstOrNull { normalise(it.collectionName) == wanted }
                ?: withFeed.firstOrNull { normalise(it.collectionName).startsWith(wanted) }
            )?.feedUrl
    }

    /**
     * Ссылка на аудио выпуска [episodeName] длительностью [durationMs]; `null` — не нашли либо
     * не уверены.
     *
     * Ключей два, и второй зависит от того, чем фид располагает:
     * - **длительность есть** — название сверяется с обеих сторон (фид часто дописывает гостя
     *   или рубрику: «… | Dr. Fei-Fei Li»), а длительность должна сойтись с допуском;
     * - **длительности в фиде нет вовсе** (так у Lex Fridman: ни `itunes:duration`, ни любого
     *   другого тега, а `length` в enclosure — заглушка 5 МБ против настоящих 143) — тогда
     *   требуется ТОЧНОЕ совпадение названия, и оно должно быть единственным. Отказываться от
     *   таких фидов целиком было бы дороже: шоу теряется всё, а точное название внутри уже
     *   опознанного шоу — ключ немногим слабее пары.
     *
     * Неоднозначность (два выпуска с тем же названием) всегда значит «молчим»: выбрать наугад
     * хуже, чем не показать кнопку.
     */
    fun enclosureFor(xml: String, episodeName: String, durationMs: Long?): String? {
        if (durationMs == null || durationMs <= 0) return null
        val wanted = normalise(episodeName)
        if (wanted.isEmpty()) return null

        val exact = mutableListOf<String>()
        for (item in items(xml)) {
            val title = normalise(entities(tag(item, "title") ?: continue))
            val sameName = title == wanted
            if (!sameName && !title.startsWith(wanted) && !wanted.startsWith(title)) continue

            val url = attribute(item, ENCLOSURE, "url")?.let(::entities)?.takeIf { it.isNotBlank() }
                ?: continue

            val seconds = durationSeconds(tag(item, "itunes:duration"))
            if (seconds == null) {
                // Длительности нет — выпуск годится только при точном имени, и решаем после
                // обхода: одноимённый близнец обязан отменить находку, а не проиграть порядку.
                if (sameName) exact += url
                continue
            }

            val drift = kotlin.math.abs(seconds * 1000.0 - durationMs) / durationMs
            if (drift <= DURATION_TOLERANCE) return url
        }
        return exact.singleOrNull()
    }

    /** `itunes:duration` бывает и голыми секундами («7707»), и часами («01:25:37», «48:07»). */
    fun durationSeconds(raw: String?): Int? {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return null
        if (!text.contains(':')) return text.toIntOrNull()?.takeIf { it > 0 }

        val parts = text.split(':').map { it.trim().toIntOrNull() ?: return null }
        val seconds = when (parts.size) {
            2 -> parts[0] * 60 + parts[1]
            3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
            else -> return null
        }
        return seconds.takeIf { it > 0 }
    }

    /** Куски `<item>…</item>` — режем строкой, а не парсером (см. врез класса). */
    private fun items(xml: String): List<String> =
        xml.split(ITEM_OPEN).drop(1).map { it.substringBefore("</item>") }

    private fun tag(item: String, name: String): String? =
        Regex("<$name[^>]*>([\\s\\S]*?)</$name>", RegexOption.IGNORE_CASE)
            .find(item)?.groupValues?.get(1)
            ?.replace(CDATA, "")?.trim()

    private fun attribute(item: String, tag: Regex, name: String): String? =
        tag.find(item)?.value?.let { Regex("""$name="([^"]*)"""", RegexOption.IGNORE_CASE).find(it) }
            ?.groupValues?.get(1)

    /**
     * Название к сравнимому виду: только буквы и цифры, разделённые пробелом.
     *
     * Сущности раскрываются ДО этого ([entities]), и это не мелочь: `&amp;` без раскрытия
     * оставляет в названии слово «amp», и выпуск перестаёт находиться. Ровно на этом
     * промахнулся первый скрипт разведки.
     */
    private fun normalise(text: String?): String =
        text.orEmpty().lowercase().replace(NON_ALNUM, " ").trim().replace(SPACES, " ")

    /** Сущности, которые реально встречаются в фидах; числовая форма закрывает остальное. */
    private fun entities(text: String): String =
        text.replace("&amp;", "&").replace("&quot;", "\"").replace("&apos;", "'")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
            .replace(NUMERIC_ENTITY) { m ->
                val code = m.groupValues[2].toIntOrNull(if (m.groupValues[1].isEmpty()) 10 else 16)
                code?.takeIf { it in 1..0x10FFFF }?.let { String(Character.toChars(it)) } ?: m.value
            }

    private val ITEM_OPEN = Regex("<item[\\s>]", RegexOption.IGNORE_CASE)
    private val ENCLOSURE = Regex("<enclosure[^>]*>", RegexOption.IGNORE_CASE)
    private val CDATA = Regex("""<!\[CDATA\[|]]>""")
    private val NUMERIC_ENTITY = Regex("""&#(x?)([0-9a-fA-F]+);""")
    private val NON_ALNUM = Regex("""[^\p{L}\p{N}]+""")
    private val SPACES = Regex("""\s+""")
}
