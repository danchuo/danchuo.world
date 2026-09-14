package world.danchuo.telegram

import io.quarkus.runtime.annotations.RegisterForReflection

/**
 * Визитка Telegram для борда (PRD §5.18) — ровно то, что рисует карточка, и ничего сверх.
 *
 * ⚠️ [avatarUrl] — НАШ адрес ([TelegramResource]), а не ссылка на CDN Telegram: зритель борда
 * не должен ходить к мессенджеру за картинкой. `null` — аватара нет или он ещё не снят.
 * Ссылки на профиль здесь нет намеренно: она уже лежит в соцссылке, под которой всплывает
 * карточка, и второй экземпляр расходился бы с первым.
 *
 * ⚠️ [RegisterForReflection] ОБЯЗАТЕЛЕН: класс уезжает наружу только внутри `Response.ok(...)`,
 * а сборка native ходит по сигнатурам ресурсов и полезную нагрузку за `Response` не видит —
 * геттеры вырезаются, и Jackson отдаёт `{}` с кодом 200 (docs/pitfalls.md).
 */
@RegisterForReflection
data class TelegramProfileView(
    val name: String,
    val username: String,
    val bio: String?,
    val avatarUrl: String?,
)
