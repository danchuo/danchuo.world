package world.danchuo.film

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmImage

/** Решение по кадру: что делать с его ориентацией (B9). */
sealed interface OrientationDecision {
    /** Кадр стоит правильно (или ориентиров нет) — не трогаем, помечаем проверенным. */
    data object Upright : OrientationDecision

    /** Верх не определился однозначно — не трогаем, помечаем `ambiguous` (ручная стрелка). */
    data object Ambiguous : OrientationDecision

    /** Верх найден — повернуть на [rotation]. */
    data class Rotate(val rotation: FrameRotation) : OrientationDecision

    /** LLM недоступна/ответ не бинарный — кадр пропустить непроверенным (ретрай позже). */
    data object Unavailable : OrientationDecision
}

/**
 * Определение верной ориентации кадра vision-LLM (B9, PRD §9 п.13). Направлению поворота
 * модель доверять нельзя (фаза 0: CW/CCW путает почти всегда) — она работает только
 * **бинарным верификатором**: повороты генерируются локально ([FilmImaging.rotate]), модель
 * отвечает лишь «стоит ли фото правильно» (YES/NO) и — при неоднозначности — «перевёрнуто ли»
 * (тай-брейк: ложные YES почти всегда на варианте вверх ногами).
 *
 * Гейт «текущее положение YES ⇒ не трогаем» защищает правильные и пустые кадры (без ориентиров
 * модель инструктирована отвечать YES) — алгоритм по построению не портит то, что уже стоит
 * правильно. Замеры фазы 0 на кадрах прода: правильные не тронуты 10/10, повёрнутые распознаны
 * 26/30, тай-брейк 19/20.
 *
 * Троттлинг перед каждым vision-вызовом — щадим рейт-лимит Groq free-tier.
 */
@ApplicationScoped
class OrientationDecider(
    private val imaging: FilmImaging,
    private val llm: LlmClient,
    @param:ConfigProperty(name = "danchuo.film.orientation.throttle-ms") private val throttleMs: Long,
) {

    // Промты — в ресурсах (prompts/), дословно с замеров фазы 0; менять только с перезамером.
    private val verifySystem = prompt("orientation-verify.system.txt")
    private val verifyUser = prompt("orientation-verify.user.txt")
    private val upsideSystem = prompt("orientation-upside-down.system.txt")
    private val upsideUser = prompt("orientation-upside-down.user.txt")

    /** Решить судьбу кадра по его thumb-варианту (для классификации хватает, дёшево по токенам). */
    fun decide(thumb: ByteArray): OrientationDecision {
        val uprightNow = verify(verifySystem, verifyUser, thumb) ?: return OrientationDecision.Unavailable
        if (uprightNow) return OrientationDecision.Upright

        val confirmed = mutableListOf<Pair<FrameRotation, ByteArray>>()
        for (rotation in FrameRotation.entries) {
            val candidate = imaging.rotate(thumb, rotation) ?: return OrientationDecision.Unavailable
            val upright = verify(verifySystem, verifyUser, candidate) ?: return OrientationDecision.Unavailable
            if (upright) confirmed += rotation to candidate
        }
        return when {
            confirmed.isEmpty() -> OrientationDecision.Ambiguous
            confirmed.size == 1 -> OrientationDecision.Rotate(confirmed.single().first)
            else -> {
                // Ложные YES почти всегда на перевёрнутом варианте — добиваем целевым вопросом.
                val survivors = confirmed.filter { (_, candidate) ->
                    val upsideDown = verify(upsideSystem, upsideUser, candidate)
                        ?: return OrientationDecision.Unavailable
                    !upsideDown
                }
                if (survivors.size == 1) {
                    OrientationDecision.Rotate(survivors.single().first)
                } else {
                    OrientationDecision.Ambiguous
                }
            }
        }
    }

    /** Один YES/NO-вопрос модели про кадр; `null` — LLM молчит или ответ не бинарный. */
    private fun verify(system: String, user: String, jpeg: ByteArray): Boolean? {
        if (throttleMs > 0) Thread.sleep(throttleMs)
        val reply = llm.completeVision(system, user, LlmImage(jpeg, "image/jpeg")) ?: return null
        val normalized = reply.trim().uppercase()
        return when {
            normalized.startsWith("YES") -> true
            normalized.startsWith("NO") -> false
            else -> null
        }
    }

    /** Промт из ресурсов `prompts/` (в native включаются через `quarkus.native.resources.includes`). */
    private fun prompt(name: String): String =
        checkNotNull(javaClass.getResourceAsStream("/prompts/$name")) { "нет промта prompts/$name" }
            .readBytes().decodeToString().trim()
}
