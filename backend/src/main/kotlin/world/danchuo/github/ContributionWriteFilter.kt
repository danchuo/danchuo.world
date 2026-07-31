package world.danchuo.github

import java.time.LocalDate

/**
 * Что из разобранного фрагмента доезжает до записи (PRD §5.4) — чистая функция, чтобы
 * решение можно было проверить без планировщика и базы.
 *
 * Фрагмент отдаёт год клеток при каждом заходе; писать их все каждые полчаса нельзя.
 */
object ContributionWriteFilter {

    /**
     * `parsed` (что отдал GitHub) + `stored` (что уже лежит; `null` = день есть, вклады не
     * собирали) → что записать.
     *
     * Три отсечения: раньше [genesis] (данных до него не существует — гард всё равно бы
     * бросил), позже [today] (хвост текущей недели приходит нулями, будущие дни в базе
     * заводить незачем) и совпадающее значение (не трогаем `updatedAt` без причины).
     */
    fun pending(
        parsed: Map<LocalDate, Int>,
        stored: Map<LocalDate, Int?>,
        genesis: LocalDate,
        today: LocalDate,
    ): Map<LocalDate, Int> = parsed
        .filterKeys { !it.isBefore(genesis) && !it.isAfter(today) }
        .filter { (date, count) -> stored[date] != count }
}
