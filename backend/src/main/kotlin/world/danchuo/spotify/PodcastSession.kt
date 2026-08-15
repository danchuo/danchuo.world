package world.danchuo.spotify

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * Непрерывный кусок прослушивания одного эпизода (PRD §5.6). Эпизод, взятый по дороге туда и
 * обратно, — это ДВЕ строки за одну дату; свёртка по эпизоду происходит уже при чтении
 * ([PodcastDayRollup]).
 *
 * [lastProgressMs] — собственное состояние поллера, и живёт оно здесь, а не в памяти: перезапуск
 * бэкенда посреди эпизода не должен терять счёт. Метаданные эпизода денормализованы намеренно
 * (см. чейнджлог 0360): борд показывает историю, а запись каталога Spotify со временем может
 * уехать — резолвить её заново на чтении значило бы переписывать прошлое.
 */
@Entity
@Table(name = "podcast_session")
class PodcastSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** Дата MSK, которой принадлежит прослушивание; сессия не пересекает полночь. */
    @Column(nullable = false)
    lateinit var date: LocalDate

    @Column(name = "episode_id", nullable = false, length = 64)
    lateinit var episodeId: String

    @Column(name = "episode_name", nullable = false, length = 512)
    lateinit var episodeName: String

    @Column(name = "episode_url", length = 512)
    var episodeUrl: String? = null

    @Column(name = "show_id", length = 64)
    var showId: String? = null

    /** Название шоу — оно же «автор» карточки: издателя плеер не отдаёт. */
    @Column(name = "show_name", nullable = false, length = 256)
    lateinit var showName: String

    @Column(name = "show_url", length = 512)
    var showUrl: String? = null

    @Column(name = "image_url", length = 512)
    var imageUrl: String? = null

    @Column(name = "episode_duration_ms")
    var episodeDurationMs: Long? = null

    @Column(name = "started_at", nullable = false)
    lateinit var startedAt: Instant

    @Column(name = "ended_at", nullable = false)
    lateinit var endedAt: Instant

    /** Зачтённое время, а не разница часов: пауза и перемотка сюда не попадают. */
    @Column(name = "listened_ms", nullable = false)
    var listenedMs: Long = 0

    /** Положение головки на последнем опросе — база для следующей дельты. */
    @Column(name = "last_progress_ms", nullable = false)
    var lastProgressMs: Long = 0

    /**
     * Положение головки, с которого пошёл зачёт этой сессии, мс. Вместе с [lastProgressMs] это
     * КУСОК ЭПИЗОДА, который был прослушан, — а не только его длина.
     *
     * Считается по тому же правилу, что и зачёт ([PodcastListenMath.openingCredit]): включил с
     * начала — засчитываем с нуля, значит и кусок начинается с нуля; продолжил вчерашнее с 20-й
     * минуты — кусок начинается с неё. Разница `lastProgressMs - listenedMs` дала бы почти то же
     * число, но перемотка назад её уводит: переслушанное время зачтено, а расстояние — нет.
     *
     * `null` — строка записана до того, как мы стали это смотреть. Такому заходу пересказ не
     * положен: резать нечего, и выдумывать начало нельзя (PRD §5.16).
     */
    @Column(name = "start_progress_ms")
    var startProgressMs: Long? = null
}

/**
 * Доступ к сессиям подкастов. Чтение — постранично по дате (карточки дня и сумма минут),
 * запись — только из [PodcastPoller].
 */
@ApplicationScoped
class PodcastSessionRepository : PanacheRepository<PodcastSession> {

    fun listByDate(date: LocalDate): List<PodcastSession> = list("date", date)

    /** Сессии диапазона `[from, to]` включительно — для пакетного чтения календаря. */
    fun listByDateRange(from: LocalDate, to: LocalDate): List<PodcastSession> =
        list("date >= ?1 and date <= ?2", from, to)

    /**
     * Последняя по времени сессия за дату — кандидат на продолжение. Поллер сам решает, тянуть
     * её дальше или открывать новую: продолжаем, только если совпал эпизод И пауза в опросах
     * не превысила порог (иначе это уже другое прослушивание).
     */
    fun latestOn(date: LocalDate): PodcastSession? =
        find("date = ?1 order by endedAt desc", date).firstResult()

    /**
     * Даты, на которых есть заходы с известным началом окна (§5.16.1) — свежие вперёд. Очередь
     * пересказов ходит по ним, а не по всем подряд: у строк, записанных до появления колонки,
     * начала нет и не появится, и гонять по ним склейку каждый такт незачем.
     *
     * Ограничение по глубине — не оптимизация, а то же самое рассуждение: чем дальше в прошлое,
     * тем меньше там строк с началом, а очередь и так берёт по одному заходу за такт.
     */
    fun datesWithWindow(today: LocalDate, days: Long): List<LocalDate> =
        getEntityManager()
            .createQuery(
                "select distinct s.date from PodcastSession s " +
                    "where s.startProgressMs is not null and s.date >= :from order by s.date desc",
                LocalDate::class.java,
            )
            .setParameter("from", today.minusDays(days))
            .resultList
}
