package world.danchuo.instagram

import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Последний пост для борда (PRD §5.17) — ровно то, что рисует карточка, и ничего сверх.
 *
 * ⚠️ [imageUrl] — НАШ адрес ([InstagramImageStorage]), а не ссылка Instagram: подписанная
 * ссылка источника протухает за часы. [likes] и [comments] — `null`, когда владелец спрятал
 * счётчики: это законное состояние поста, карточка просто не рисует строку.
 *
 * ⚠️ [RegisterForReflection] ОБЯЗАТЕЛЕН: класс уезжает наружу только внутри `Response.ok(...)`,
 * а сборка native ходит по сигнатурам ресурсов и полезную нагрузку за `Response` не видит —
 * геттеры вырезаются, и Jackson отдаёт `{}` с кодом 200. На JVM (дев, тесты, локальный стек)
 * всё сериализуется честно, поэтому промах доезжает до прода целым и тестом не ловится
 * (docs/pitfalls.md).
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
