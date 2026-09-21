package world.danchuo.feedback

import io.quarkus.hibernate.orm.panache.kotlin.PanacheRepository
import io.quarkus.panache.common.Sort
import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class FeedbackRepository : PanacheRepository<FeedbackNote> {

    /** The owner's inbox, newest first. Bot-marked rows travel too — they are the spam evidence. */
    fun listNewestFirst(): List<FeedbackNote> = listAll(Sort.by("submittedAt").descending())
}
