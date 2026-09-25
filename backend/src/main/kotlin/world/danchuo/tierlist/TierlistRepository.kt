package world.danchuo.tierlist

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Page
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class TierlistRepository : PanacheRepository<TierlistEntry> {

    /** The public shelf: newest first, bot-marked rows left out. */
    fun publicNewestFirst(limit: Int): List<TierlistEntry> =
        find("isBot = false", Sort.by("submittedAt").descending()).page(Page.ofSize(limit)).list()

    /** Case-insensitive, over bot-marked rows too; `uq_tierlist_nick` backs it against a race. */
    fun nickTaken(nick: String): Boolean = count("lower(nick) = ?1", nick.lowercase()) > 0

    fun allNewestFirst(): List<TierlistEntry> = listAll(Sort.by("submittedAt").descending())
}
