package world.danchuo.summary

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Правила очереди пересказов (PRD §5.16) — кого вообще спрашивать у модели.
 *
 * Раньше эти правила проверялись только через `@QuarkusTest` с живой БД: чтобы задать вопрос
 * «дорос ли заход настолько, чтобы пересобрать пересказ», приходилось поднимать Postgres и
 * писать строку. Сами правила при этом — арифметика над четырьмя числами и ни на что не
 * опираются, поэтому здесь они проверяются напрямую, а служба ([SummaryServiceTest]) отвечает
 * уже только за то, что читает и пишет их в базу.
 *
 * Правил ровно четыре, и все четыре про «что уже рассказано», а не про «сколько раз пробовали»:
 * - **не спрашивали** — берём;
 * - **рассказано и заход не сдвинулся** — не берём, иначе фон жёг бы бесплатный лимит на одном
 *   и том же куске;
 * - **заход дорос за порог** — берём заново: текст про его начало перестал отвечать за него
 *   целиком;
 * - **промахи считаются**, но счёт ведётся ПО ЦЕЛИ: заход, доросший дальше, — новая цель, и
 *   прежнее «сдаюсь» было принято про другой кусок.
 */
class SummaryPolicyTest {

    private val refresh = 0.02
    private val maxAttempts = 3

    @Test
    fun `a sitting nobody asked about is in line`() {
        assertTrue(queued(end = 0.15, known = null))
    }

    @Test
    fun `a retold sitting that has not moved is left alone`() {
        assertFalse(queued(end = 0.15, known = told(covered = 0.15, target = 0.15)))
    }

    @Test
    fun `a sitting that grew past the threshold comes back in line`() {
        assertTrue(queued(end = 0.30, known = told(covered = 0.15, target = 0.15)))
    }

    @Test
    fun `a hair of extra progress does not wake the queue`() {
        // Полпроцента книги — это округление процента у читалки и пара абзацев; звать за них
        // модель незачем. Ноль вместо порога означал бы поход к модели на каждый такт поллера.
        assertFalse(queued(end = 0.16, known = told(covered = 0.15, target = 0.15)))
    }

    @Test
    fun `a miss keeps the sitting in line until the attempts run out`() {
        assertTrue(queued(end = 0.15, known = missed(target = 0.15, attempts = 1)))
        assertTrue(queued(end = 0.15, known = missed(target = 0.15, attempts = 2)))
        assertFalse(queued(end = 0.15, known = missed(target = 0.15, attempts = 3)))
    }

    @Test
    fun `growing further gives a given-up sitting another chance`() {
        val givenUp = missed(target = 0.15, attempts = 3)

        assertFalse(queued(end = 0.15, known = givenUp), "попытки на эту цель вышли")
        assertTrue(queued(end = 0.40, known = givenUp), "дорос — это другая цель, счёт заново")
    }

    @Test
    fun `the attempt counter restarts on a new target and adds up on the same one`() {
        // Счёт промахов держит решение «сдаюсь» только про ту цель, на которую целились.
        assertEquals(1, attempts(known = null, end = 0.15))
        assertEquals(2, attempts(known = missed(target = 0.15, attempts = 1), end = 0.15))
        assertEquals(1, attempts(known = missed(target = 0.15, attempts = 2), end = 0.40))
    }

    @Test
    fun `a sitting told about a shorter stretch is asked again even after a miss`() {
        // Освежение промахнулось: цель осталась прежней, попытки капают, но пока они не вышли,
        // заход обязан оставаться в очереди — на карточке лежит текст про меньший кусок.
        val stale = SummaryState(ready = true, coveredEnd = 0.15, targetEnd = 0.40, attempts = 1)

        assertTrue(queued(end = 0.40, known = stale))
    }

    private fun queued(end: Double, known: SummaryState?): Boolean =
        SummaryPolicy.queued(end, known, refresh, maxAttempts)

    private fun attempts(known: SummaryState?, end: Double): Int =
        SummaryPolicy.attemptsAfter(known, end, refresh)

    /** Про заход рассказано ровно до [covered], и последняя попытка целилась в [target]. */
    private fun told(covered: Double, target: Double) =
        SummaryState(ready = true, coveredEnd = covered, targetEnd = target, attempts = 0)

    /** Про заход рассказать не смогли: покрывать нечем, но попытки засчитаны. */
    private fun missed(target: Double, attempts: Int) =
        SummaryState(ready = false, coveredEnd = null, targetEnd = target, attempts = attempts)
}
