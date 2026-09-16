package world.danchuo.instagram

import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * The latest post as the card draws it, nothing beyond. [imageUrl] is OUR address rather than
 * Instagram's expiring one, and [likes]/[comments] are null when the owner hid the counters.
 * [RegisterForReflection] is MANDATORY here — see docs/pitfalls.md for what native-image does.
 */
@RegisterForReflection
data class InstagramPostView(
    val username: String,
    val permalink: String,
    val caption: String?,
    val mediaType: String,
    val imageUrl: String?,
    val avatarUrl: String?,
    val likes: Int?,
    val comments: Int?,
    /** ISO-8601 UTC — the relative "2 days ago" is the frontend's job, as on the other tiles. */
    val postedAt: String,
)

fun InstagramPost.toView(storage: InstagramImageStorage) = InstagramPostView(
    username = username,
    permalink = permalink,
    caption = caption,
    mediaType = mediaType,
    imageUrl = storage.urlOf(InstagramImageStorage.Kind.POST),
    avatarUrl = storage.urlOf(InstagramImageStorage.Kind.AVATAR),
    likes = likeCount,
    comments = commentsCount,
    postedAt = postedAt.toString(),
)
