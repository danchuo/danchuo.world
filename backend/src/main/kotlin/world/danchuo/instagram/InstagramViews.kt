package world.danchuo.instagram

/**
 * Последний пост для борда (PRD §5.17) — ровно то, что рисует карточка, и ничего сверх.
 *
 * ⚠️ [imageUrl] — НАШ адрес ([InstagramImageStorage]), а не ссылка Instagram: подписанная
 * ссылка источника протухает за часы. [likes] и [comments] — `null`, когда владелец спрятал
 * счётчики: это законное состояние поста, карточка просто не рисует строку.
 */
data class InstagramPostView(
    val username: String,
    val permalink: String,
    val caption: String?,
    val mediaType: String,
    val imageUrl: String?,
    val avatarUrl: String?,
    val likes: Int?,
    val comments: Int?,
    /** ISO-8601 UTC — относительное «2 дня назад» считает фронт, как у остальных плиток. */
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
