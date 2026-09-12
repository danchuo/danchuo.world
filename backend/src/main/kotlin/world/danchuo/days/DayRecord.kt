package world.danchuo.days

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate

/**
 * Запись одного дня (PRD §7) — ось данных danchuo.world. Ключ — [date] (LocalDate
 * в каноне MSK), уникален; модель строится вокруг дня (плитка «Сегодня», календарь).
 *
 * **Null ≠ 0 (PRD §5.4).** Все статы здоровья nullable: `null` = «нет данных»,
 * `0` = реальный ноль (0 шагов — валидно). Не схлопывать в 0 на уровне модели.
 *
 * Запись наполняется несколькими слайсами через [DayRecordService] (единая точка
 * инвариантов — генезис-гард, `updatedAt`):
 * - `health` → шаги, сон и его фазы (`ingest/health`);
 * - `checklist` → имя дня (`ingest/daily`).
 *
 * Монстра запись дня НЕ несёт: «пил / не пил» живёт отметкой пункта `monster`
 * в `checklist_entry` (§5.6) — там же, где считается его прогресс.
 *
 * Колонок «на будущее» тут нет: `screen_time/reading_progress/day_photo` прожили год
 * незаполненными и сняты (§9). Заведём, когда появится канал, который в них пишет.
 */
@Entity
@Table(name = "day_record")
class DayRecord {

    @Id
    @Column(nullable = false)
    lateinit var date: LocalDate

    /** Имя дня (§5.2/§5.6): задаётся/правится задним числом; нет имени — `null`. */
    @Column(name = "title")
    var title: String? = null

    // ── Apple Health (§5.4): nullable; null = нет данных, 0 = реальный ноль ──
    @Column(name = "steps")
    var steps: Int? = null

    /** Сон относится ко **дню пробуждения** (PRD §4). */
    @Column(name = "sleep_minutes")
    var sleepMinutes: Int? = null

    @Column(name = "sleep_rem_minutes")
    var sleepRemMinutes: Int? = null

    @Column(name = "sleep_deep_minutes")
    var sleepDeepMinutes: Int? = null

    @Column(name = "sleep_light_minutes")
    var sleepLightMinutes: Int? = null

    @Column(name = "sleep_awake_minutes")
    var sleepAwakeMinutes: Int? = null

    /**
     * Измеренные минуты в приложении «Журнал» за **вечернее окно** дня (PRD §5.6).
     * `null` = «не мерили» (ручная отметка или день до появления канала) — это не ноль.
     * Отметка пункта живёт в `checklist_entry`: здесь измерение, там решение.
     */
    @Column(name = "journal_minutes")
    var journalMinutes: Int? = null

    /**
     * Вклады GitHub за день (PRD §5.4): коммиты + PR + ревью + issue, как их считает сам
     * календарь профиля. `null` = «день не собирали», `0` = «собрали, вкладов не было» —
     * различие здесь рабочее, нулевых дней много. Корзину дня назначает GitHub, мы её не
     * пересчитываем (см. врез про границу суток в §5.4).
     */
    @Column(name = "contributions")
    var contributions: Int? = null

    @Column(name = "created_at", nullable = false)
    lateinit var createdAt: Instant

    @Column(name = "updated_at", nullable = false)
    lateinit var updatedAt: Instant
}
