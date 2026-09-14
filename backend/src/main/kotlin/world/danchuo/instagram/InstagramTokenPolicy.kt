package world.danchuo.instagram

import java.time.Duration
import java.time.Instant

/**
 * Когда продлевать долгоживущий токен Instagram (PRD §5.17). Чистая арифметика: ни БД, ни сети.
 *
 * ⚠️ **Продление возможно только у ЖИВОГО токена.** Instagram продлевает текущий токен, а не
 * выдаёт новый по секрету приложения: просрочил окно — восстановить нечем, нужен новый заход
 * владельца через OAuth в браузере. Отсюда запас: продлеваем на сороковой день из шестидесяти,
 * и даже двухнедельный простой бэкенда окно не закрывает. Лишний вызов не стоит ничего,
 * упущенный — стоит ручного визита.
 *
 * ⚠️ **Есть и нижняя граница:** токену должно быть не меньше суток, иначе Instagram отказывает.
 * Без неё свежий токен из OAuth дёргался бы на первом же такте поллера и получал отказ.
 */
object InstagramTokenPolicy {

    /** Сколько живёт долгоживущий токен со дня выдачи. */
    val LIFETIME: Duration = Duration.ofDays(60)

    /** На какой день жизни токена начинаем продлевать. */
    const val REFRESH_AFTER_DAYS = 40L

    /** Раньше суток Instagram продлить не даст. */
    private val MIN_AGE: Duration = Duration.ofDays(1)

    fun needsRefresh(issuedAt: Instant, now: Instant): Boolean {
        val age = Duration.between(issuedAt, now)
        return age >= MIN_AGE && age >= Duration.ofDays(REFRESH_AFTER_DAYS)
    }

    /** Жив ли токен вообще — мёртвый не продлить, он лечится только новым OAuth. */
    fun isAlive(issuedAt: Instant, now: Instant): Boolean =
        Duration.between(issuedAt, now) < LIFETIME
}
