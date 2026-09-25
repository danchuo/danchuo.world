package world.danchuo.tierlist

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Reading a published tier list (PRD §5.20) — pure logic, no Quarkus or Docker. */
class TierlistPolicyTest {

    private inline fun <reified T : TierlistOutcome> outcome(req: TierlistRequest): T {
        val out = TierlistPolicy.read(req)
        assertTrue(out is T) { "expected ${T::class.simpleName}, got $out" }
        return out as T
    }

    private fun accepted(req: TierlistRequest): TierlistDraft = outcome<TierlistOutcome.Accepted>(req).draft

    private fun rejected(req: TierlistRequest): TierlistOutcome.Rejected = outcome(req)

    @Test
    fun `a placement comes back with every tier present and in tier order`() {
        val draft = accepted(TierlistRequest(nick = "  аня ", tiers = mapOf("B" to listOf("tee-2"), "S" to listOf("tee-1"))))
        assertEquals("аня", draft.nick)
        assertEquals(listOf("S", "A", "B", "C", "D"), draft.tiers.keys.toList())
        assertEquals(listOf("tee-1"), draft.tiers["S"])
        assertEquals(emptyList<String>(), draft.tiers["A"])
    }

    @Test
    fun `a blank nick is no nick`() {
        assertNull(accepted(TierlistRequest(nick = " ​ ", tiers = mapOf("S" to listOf("a")))).nick)
    }

    @Test
    fun `an over-long nick is rejected, not cut`() {
        val out = rejected(TierlistRequest(nick = "я".repeat(TierlistPolicy.NICK_MAX + 1), tiers = mapOf("S" to listOf("a"))))
        assertEquals("too_long", out.error)
        assertEquals("nick", out.field)
    }

    @Test
    fun `nothing placed is rejected`() {
        assertEquals("empty", rejected(TierlistRequest(tiers = null)).error)
        assertEquals("empty", rejected(TierlistRequest(tiers = mapOf("S" to emptyList()))).error)
    }

    @Test
    fun `an unknown tier is rejected`() {
        assertEquals("bad_tier", rejected(TierlistRequest(tiers = mapOf("F" to listOf("a")))).error)
    }

    @Test
    fun `an item id outside the slug alphabet is rejected`() {
        assertEquals("bad_item", rejected(TierlistRequest(tiers = mapOf("S" to listOf("<img>")))).error)
        assertEquals("bad_item", rejected(TierlistRequest(tiers = mapOf("S" to listOf("")))).error)
    }

    @Test
    fun `one shirt in two places is rejected`() {
        val out = rejected(TierlistRequest(tiers = mapOf("S" to listOf("a"), "D" to listOf("a"))))
        assertEquals("duplicate_item", out.error)
    }

    @Test
    fun `too many items is rejected`() {
        val many = (0..TierlistPolicy.MAX_ITEMS).map { "t-$it" }
        assertEquals("too_many", rejected(TierlistRequest(tiers = mapOf("S" to many))).error)
    }

    @Test
    fun `a filled honeypot is discarded`() {
        outcome<TierlistOutcome.Discarded>(TierlistRequest(tiers = mapOf("S" to listOf("a")), website = "x"))
    }
}
