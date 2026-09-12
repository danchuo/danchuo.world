package world.danchuo.reading

import jakarta.enterprise.context.ApplicationScoped
import jakarta.transaction.Transactional
import world.danchuo.checklist.ReadingMarker
import java.time.Duration
import java.time.Instant
import java.time.LocalDate

/**
 * Запись и чтение прочитанного (PRD §5.16) — состояние поллера и свёртки дня.
 *
 * Отдельный бин от [ReadingPoller] не для красоты: `@Transactional` — это CDI-перехватчик, а он
 * не срабатывает на вызове метода того же бина. Поллеру нужно писать в БД, значит вызов должен
 * уйти наружу, в соседний бин (тот же приём, что в слайсе подкастов).
 */
@ApplicationScoped
class ReadingService(
    private val sessions: ReadingSessionRepository,
    private val bookStates: ReadingBookStateRepository,
    private val marker: ReadingMarker,
    private val config: ReadingConfig,
) {

    /**
     * Втянуть снимок полки. Возвращает зачтённые секунды — ноль означает «ничего не изменилось»
     * (файл тот же, счётчики те же), и поллеру не за чем сбрасывать проекцию дня.
     *
     * Проход идёт по ВСЕМ дням снимка, а не только по сегодняшнему: телефон мог синкнуться с
     * опозданием, и вчерашние минуты приезжают сегодня. Зачёт считается разницей с уже
     * записанным ([ReadingSessionMath.credit]), поэтому повторный проход по тем же дням
     * бесплатен и ничего не задваивает.
     */
    @Transactional
    fun absorb(snapshot: ShelfSnapshot, today: LocalDate, at: Instant): Int {
        var credited = 0
        val touched = LinkedHashSet<LocalDate>()
        // Что мы видели на ПРОШЛОМ такте — снимается до разбора: это и есть «откуда» для захода,
        // который вот-вот откроется. Возьми проценты после — и старт совпал бы с финишем.
        val seenBefore = bookStates.percentsByBook()

        // Порядок по датам не косметика: прошлые дни должны лечь импортом ДО того, как откроется
        // сегодняшняя сессия, — иначе она не увидит, что у книги уже была история.
        for (total in snapshot.dayTotals.sortedWith(compareBy({ it.date }, { it.bookId }))) {
            val book = snapshot.books[total.bookId] ?: continue
            val gained = absorb(book, total, snapshot, seenBefore, today, at)
            if (gained > 0) {
                credited += gained
                touched += total.date
            }
        }

        // Наблюдение обновляем в конце и по ВСЕМ книгам полки, а не только по читавшимся: смысл
        // строки как раз в книге, которая лежит нетронутой, — её процент понадобится, когда за
        // неё сядут.
        snapshot.books.values.forEach { book ->
            bookStates.observe(book.id, book.percent, at)
            // Путь к файлу дописываем всем заходам этой книги, у которых его ещё нет: метаданные
            // освежаются только вместе с приростом минут, а файл мы стали забирать позже самих
            // заходов — иначе вся прошлая история осталась бы без пересказа навсегда (§5.16).
            book.filePath?.let { sessions.fillMissingFilePath(book.id, it) }
        }

        touched.forEach(::remark)
        return credited
    }

    /** Сессии за сутки в хронологическом порядке — карточки дня. */
    fun sessionsOn(date: LocalDate): List<ReadingSession> =
        sessions.listByDate(date).sortedWith(compareBy({ it.startedAt ?: Instant.EPOCH }, { it.id }))

    /** Суммарно прочитанные минуты за сутки — подпись пункта дисциплины. */
    fun minutesOn(date: LocalDate): Int = ReadingDayRollup.minutes(secondsOn(date))

    // ── запись ──

    /**
     * Втянуть прирост счётчика одной книги за один день. День уже прошедший ложится
     * импортированной строкой (времени и процентов у него взяться неоткуда), сегодняшний —
     * живой сессией: продолжаем открытую либо начинаем новую.
     */
    private fun absorb(
        book: ShelfBook,
        total: ShelfDayTotal,
        snapshot: ShelfSnapshot,
        seenBefore: Map<Long, Double>,
        today: LocalDate,
        at: Instant,
    ): Int {
        val existing = sessions.listByBookAndDate(book.id, total.date)
        val credit = ReadingSessionMath.credit(total.seconds, existing.sumOf { it.readSeconds })
        if (credit == 0) return 0

        if (total.date.isBefore(today)) {
            importPast(book, total.date, credit, existing)
        } else if (!live(book, total, snapshot, seenBefore, credit, at)) {
            // Открыл книгу глянуть: сессию не заводим, секунды остаются незачтёнными и доедут
            // со следующим приростом (зачёт считается от счётчика читалки, а не по тактам).
            return 0
        }
        return credit
    }

    /**
     * Прошедший день: минуты известны, всё остальное — нет. Одна импортированная строка на
     * книгу-день, которая при позднем синке дорастает, а не плодит соседей: рассказать про
     * вчерашние заходы нам всё равно нечего, а лишние строки заняли бы карточки зря.
     */
    private fun importPast(book: ShelfBook, date: LocalDate, credit: Int, existing: List<ReadingSession>) {
        val imported = existing.firstOrNull { it.source == ReadingSource.IMPORTED.code() }
        if (imported != null) {
            imported.readSeconds += credit
            imported.describe(book)
            return
        }
        sessions.persist(
            newSession(book, date, credit).apply { source = ReadingSource.IMPORTED.code() },
        )
    }

    /**
     * Сегодняшний день: тянем открытую сессию, если пауза в пределах порога, иначе начинаем
     * новую. Начало новой — последний известный процент книги: вчерашняя остановка на 35% и
     * есть «откуда» сегодняшнего захода. Не знаем — оставляем пусто, а не подставляем текущий:
     * «с 42% до 42%» читалось бы как «ничего не прочитал».
     */
    private fun live(
        book: ShelfBook,
        total: ShelfDayTotal,
        snapshot: ShelfSnapshot,
        seenBefore: Map<Long, Double>,
        credit: Int,
        at: Instant,
    ): Boolean {
        val gap = Duration.ofMinutes(config.sessionGapMinutes())
        val latest = sessions.latestOn(book.id, total.date)

        if (latest != null &&
            latest.source == ReadingSource.LIVE.code() &&
            ReadingSessionMath.continues(latest.endedAt, at, gap)
        ) {
            latest.readSeconds += credit
            latest.endedAt = at
            book.percent?.let { latest.endPercent = it }
            latest.describe(book)
            return true
        }

        // Порог — только на ОТКРЫТИЕ сессии: дочитанные полминуты уже начатого захода зачитываются.
        if (credit < config.minSessionSeconds()) return false

        sessions.persist(
            newSession(book, total.date, credit).apply {
                // «Откуда» ищется по убыванию точности: где мы сами закончили в прошлый раз →
                // что видели на полке до этого захода → ноль у никогда не читанной книги.
                startPercent = sessions.lastKnownPercent(book.id)
                    ?: seenBefore[book.id]
                    ?: fromScratch(book, total, snapshot)
                endPercent = book.percent
                startedAt = at
                endedAt = at
            },
        )
        return true
    }

    /**
     * «Откуда» для книги, про которую мы ничего не знаем. Ноль — только если книгу и правда
     * начали сейчас: на полке нет ни одного дня чтения раньше этого. Если дни были, а мы их не
     * видели (полка приехала с историей), старт остаётся пустым — подставить туда ноль значило бы
     * приписать владельцу проценты, которые он прошёл до нас.
     *
     * Одних счётчиков читалки для этого мало. Прогресс, принесённый из ДРУГОГО приложения (позиция
     * выставлена руками), не оставляет в Anx ни одного прошлого дня — по счётчикам такая книга
     * неотличима от начатой с нуля, и заход записался бы как «с 0% до 47%» за три минуты. Поэтому
     * ноль ещё и проверяется на правдоподобие: проценты, которые сегодняшними минутами объяснить
     * нельзя, прочитаны не сегодня.
     */
    private fun fromScratch(book: ShelfBook, total: ShelfDayTotal, snapshot: ShelfSnapshot): Double? {
        if (snapshot.dayTotals.any { it.bookId == book.id && it.date.isBefore(total.date) }) return null
        val percent = book.percent ?: return 0.0
        return if (total.seconds >= percent * 100 * MIN_SECONDS_PER_PERCENT) 0.0 else null
    }

    /** Пересчитать отметку пункта по сумме минут; ручную отметку [ReadingMarker] не тронет. */
    private fun remark(date: LocalDate) {
        val target = marker.target() ?: return
        marker.mark(date, ReadingDayRollup.occurrences(secondsOn(date), target))
    }

    /** Сумма зачтённого за сутки по всем книгам — от неё считаются отметки пункта. */
    private fun secondsOn(date: LocalDate): Int = sessions.listByDate(date).sumOf { it.readSeconds }

    private fun newSession(book: ShelfBook, date: LocalDate, credit: Int) =
        // IDENTITY-генерация вставляет строку немедленно ⇒ все not-null поля заполняем ДО persist.
        ReadingSession().apply {
            this.date = date
            bookId = book.id
            readSeconds = credit
            describe(book)
        }

    /** Освежить метаданные строки: переименовал книгу или сменил обложку — увидим это на борде. */
    private fun ReadingSession.describe(book: ShelfBook) {
        bookTitle = book.title
        bookAuthor = book.author
        coverPath = book.coverPath
        // Путь файла не затираем пустотой: книга, снятая с полки, не должна лишать прошлый
        // заход пересказа, который по ней ещё можно собрать.
        book.filePath?.let { bookFilePath = it }
    }

    private companion object {
        /**
         * Порог правдоподобия старта с нуля: секунд чтения на один процент книги. Взят с огромным
         * запасом — 18 с/процент это целая книга за полчаса, то есть заведомо быстрее любого
         * настоящего чтения. Порог не измеряет скорость владельца и не нужен для этого: он
         * отделяет чтение от переноса позиции, а между ними разница на порядки (сегодняшний
         * случай — 3.6 с/процент против 180 с/процент у реальных получаса за 10% книги).
         */
        const val MIN_SECONDS_PER_PERCENT = 18
    }
}
