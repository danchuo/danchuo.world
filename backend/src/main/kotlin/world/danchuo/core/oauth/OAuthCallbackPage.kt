package world.danchuo.core.oauth

/**
 * The one-off OAuth callback page, shared by every provider's callback. Its text is DATA: part of
 * it arrives in a query parameter, and the page is served as HTML on the site's OWN origin, where
 * a tag would run beside the admin session. PRD §3
 */
object OAuthCallbackPage {

    /** How much of the provider's own error code is worth showing; the rest is noise. */
    const val MAX_DETAIL = 100

    /** The finished page. [message] is escaped here — the ONE place, so callers never double it. */
    fun html(provider: String, message: String): String =
        "<!doctype html><meta charset=utf-8><title>danchuo.world · ${escape(provider)}</title>" +
            "<p>${escape(message)}</p>"

    /** The provider's `error`, cut to a diagnostic. Escaping stays in [html]. */
    fun detail(raw: String): String = raw.take(MAX_DETAIL)

    private fun escape(value: String): String = buildString(value.length) {
        for (ch in value) when (ch) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&#39;")
            else -> append(ch)
        }
    }
}
