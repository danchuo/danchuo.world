package world.danchuo.film

import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import world.danchuo.llm.LlmClient
import world.danchuo.llm.LlmImage

/** The decision for a frame: what to do about its orientation (B9). */
sealed interface OrientationDecision {
    /** The frame stands correctly (or has no landmarks) — leave it, mark it checked. */
    data object Upright : OrientationDecision

    /** The top was not determined — leave it, mark `ambiguous` for the manual arrow. */
    data object Ambiguous : OrientationDecision

    /** The top was found — rotate by [rotation]. */
    data class Rotate(val rotation: FrameRotation) : OrientationDecision

    /** The LLM is unavailable or answered non-binary — skip the frame unchecked and retry later. */
    data object Unavailable : OrientationDecision
}

/**
 * Decides a frame's correct orientation with a vision LLM used ONLY as a binary verifier: turns
 * are generated locally and the model just answers "is this upright", with an "is it upside down"
 * tie-break. Its sense of direction is never trusted. Gate and measurements: PRD §5.12.
 */
@ApplicationScoped
class OrientationDecider(
    private val imaging: FilmImaging,
    private val llm: LlmClient,
    @param:ConfigProperty(name = "danchuo.film.orientation.throttle-ms") private val throttleMs: Long,
) {

    // Prompts live in resources (prompts/), verbatim from the phase-0 measurements; change them
    // only together with a re-measurement.
    private val verifySystem = prompt("orientation-verify.system.txt")
    private val verifyUser = prompt("orientation-verify.user.txt")
    private val upsideSystem = prompt("orientation-upside-down.system.txt")
    private val upsideUser = prompt("orientation-upside-down.user.txt")

    /** Decides a frame's fate off its thumb variant: enough to classify, and cheap in tokens. */
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
                // False YES answers land almost always on the flipped variant — follow up.
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

    /** One YES/NO question about the frame; `null` when the LLM is silent or non-binary. */
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

    /** A prompt from `prompts/` (included in native via `quarkus.native.resources.includes`). */
    private fun prompt(name: String): String =
        checkNotNull(javaClass.getResourceAsStream("/prompts/$name")) { "нет промта prompts/$name" }
            .readBytes().decodeToString().trim()
}
