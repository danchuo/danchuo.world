package world.danchuo.reading

import io.quarkus.scheduler.Scheduled
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import world.danchuo.core.config.MskTime
import world.danchuo.days.DayRecordService
import java.time.Instant

/**
 * Фоновый забор прочитанного с полки Anx Reader (PRD §5.16). Внешний источник целиком в слайсе:
 * наружу уходят только сессии ([ReadingSession]) и производная отметка пункта «Чтение».
 *
 * **Почему опрос файла, а не приём с телефона.** Публичного API у читалки нет вовсе, и канал
 * наружу у неё ровно один — WebDAV-синк, который выгружает базу целиком. Зато выгружает он её
 * САМ, когда приложение уходит в фон (свернули, заблокировали телефон, закрыли) — из книги для
 * этого выходить не надо. Поэтому опрос редкий (5 минут): файл меняется пару раз в сутки, а
 * минуты внутри него посчитаны читалкой и никуда не денутся.
 *
 * **Отсюда же разница с подкастами.** Там дельту головки меряем мы, и пропущенный опрос —
 * это недобор минут навсегда. Здесь опрос лишь забирает уже посчитанное: пропустили такт,
 * пролежал бэкенд сутки, приехал офлайновый день недельной давности — следующий же проход
 * вберёт всё, потому что зачёт считается разницей с записанным, а не по числу опросов.
 *
 * **Сбой канала ничего не портит.** Нет полки, недописан PUT, сменилась схема читалки — прогон
 * просто не пишет; следующий попробует снова.
 */
@ApplicationScoped
class ReadingPoller(
    private val shelf: AnxShelf,
    private val reading: ReadingService,
    private val config: ReadingConfig,
    private val days: DayRecordService,
    private val mskTime: MskTime,
) {

    private val log: Logger = Logger.getLogger(ReadingPoller::class.java)

    @Scheduled(
        every = "{danchuo.reading.poll-interval}",
        delayed = "30s",
        concurrentExecution = Scheduled.ConcurrentExecution.SKIP,
    )
    fun poll() {
        if (!config.enabled() || !config.isConfigured()) return
        runCatching { pollOnce() }
            .onFailure { log.warn("reading: полку прочитать не удалось: ${it.message}") }
    }

    /** Один проход. Возвращает зачтённые секунды: 0 — полка не менялась либо её нет. */
    fun pollOnce(): Int {
        // Полки ещё нет — телефон не синкался ни разу. Это нормальное состояние, а не поломка.
        val snapshot = shelf.snapshot() ?: return 0
        val credited = reading.absorb(snapshot, mskTime.today(), Instant.now())
        // Проекция дня зависит от минут и карточек; сбрасываем её, только когда они сдвинулись.
        if (credited > 0) days.invalidateProjection()
        return credited
    }
}
