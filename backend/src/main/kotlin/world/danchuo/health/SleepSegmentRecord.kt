package world.danchuo.health

import io.quarkus.cache.CacheInvalidateAll
import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * Сырой кусок ночи как его прислал HealthKit (PRD §5.4, реестр I-23) — N к дню **по дате
 * пробуждения** (плоская связь, без JPA-отношения: слайсы расцеплены, §3.1).
 *
 * Почему сырое, а не готовая полоса: агрегат ночи считался и раньше, но куски выбрасывались, и
 * задать им новый вопрос было нечем — ни «сколько раз просыпался», ни «во сколько обычно ложусь»
 * задним числом не восстановить. Хранение стоит десятков строк на ночь; вопросы к ним будут
 * появляться дальше (I-22 экстремумы, I-19 линза), а вторая попытка собрать эти данные — нет.
 *
 * Перекрытия и дубли источников здесь **не разбираются**: это делает [SleepSessionizer] на
 * чтении. В базе лежит то, что было прислано, — чтобы правило разбора можно было менять,
 * не теряя истории.
 */
@Entity
@Table(name = "sleep_segment")
class SleepSegmentRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null

    /** День пробуждения (§4): кусок принадлежит ночи, из которой проснулись в этот день. */
    @Column(name = "wake_date", nullable = false)
    lateinit var wakeDate: LocalDate

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    lateinit var stage: SleepStage

    @Column(name = "started_at", nullable = false)
    lateinit var startedAt: Instant

    @Column(name = "ended_at", nullable = false)
    lateinit var endedAt: Instant
}

/**
 * Доступ к кускам ночи. Приём за дату — **полная замена** набора ([replaceForWakeDate]):
 * идемпотентно, повтор прогона не плодит дубли (та же дисциплина, что у тренировок).
 */
@ApplicationScoped
class SleepSegmentRepository : PanacheRepository<SleepSegmentRecord> {

    fun listByWakeDate(date: LocalDate): List<SleepSegmentRecord> =
        list("wakeDate", date)

    /**
     * Полная замена кусков ночи: стираем прежние и кладём новые.
     *
     * Гасит кэш детали ночи целиком: приём одной ночи двигает и профиль «обычной ночи»
     * тридцати соседних дней — точечная инвалидация тут была бы дороже пересчёта.
     */
    @CacheInvalidateAll(cacheName = "sleep-night")
    fun replaceForWakeDate(date: LocalDate, segments: List<SleepSegment>) {
        delete("wakeDate", date)
        segments.forEach { segment ->
            persist(
                SleepSegmentRecord().apply {
                    wakeDate = date
                    stage = segment.stage
                    startedAt = segment.start
                    endedAt = segment.end
                },
            )
        }
    }
}
