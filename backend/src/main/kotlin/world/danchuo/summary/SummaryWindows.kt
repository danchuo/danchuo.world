package world.danchuo.summary

/**
 * Как длинный кусок ужимается под потолок одного вызова модели (PRD §5.16).
 *
 * Потолок держит вызов внутри самого скупого free-лимита (у Groq это 12 тысяч токенов в минуту),
 * а на длинных заходах ещё и режет ожидание ответа. Но **обрезать по началу нельзя**: пересказ
 * оборвался бы на середине захода и молчал ровно про то место, где владелец остановился, — а
 * оно самое памятное. Вместо обрезки берём несколько равномерных окон по всей длине, последнее
 * — впритык к концу, и отмечаем пропуски явно, чтобы модель видела разрывы, а не сочиняла
 * мостики между ними.
 *
 * Живёт это здесь, а не в разборе epub, потому что про книги оно ничего не знает. Замер на
 * расшифровке подкаста: 767 знаков на минуту речи, то есть часовой заход — 46 тысяч знаков
 * против потолка в 12 тысяч. Для подкастов нарезка окнами станет не краевым случаем, а
 * основным путём (и резать там выгоднее само аудио — до расшифровки, а не после).
 */
object SummaryWindows {

    /** На сколько окон режется кусок, не влезший в потолок. */
    const val WINDOWS = 4

    /** Окно тоньше этого пересказывать нечем — тогда берём одну связную выдержку. */
    const val MIN_WINDOW = 300

    /** Явный разрыв между окнами: модель должна видеть пропуск, а не додумывать его. */
    const val GAP = "\n\n[…]\n\n"

    /**
     * Ужать [text] до [maxChars]. Влезает — отдаём как есть; не влезает — режем окнами по всей
     * длине. Совсем маленький потолок (меньше [MIN_WINDOW] на окно) окнами не нарезать: там
     * честнее одна связная выдержка от начала, чем четыре обрывка по паре слов.
     */
    fun cap(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val budget = maxChars - (WINDOWS - 1) * GAP.length
        if (budget / WINDOWS < MIN_WINDOW) return word(text, maxChars)

        val window = budget / WINDOWS
        val step = (text.length - window) / (WINDOWS - 1)
        return (0 until WINDOWS).joinToString(GAP) { i ->
            val start = if (i == WINDOWS - 1) text.length - window else i * step
            word(text.substring(start, start + window), window).trim()
        }
    }

    /** Обрезка по границе слова, чтобы выдержка не обрывалась на полубукве. */
    fun word(text: String, maxChars: Int): String {
        if (text.length <= maxChars) return text
        val cut = text.take(maxChars)
        val lastSpace = cut.lastIndexOf(' ')
        return if (lastSpace > maxChars / 2) cut.take(lastSpace) else cut
    }
}
