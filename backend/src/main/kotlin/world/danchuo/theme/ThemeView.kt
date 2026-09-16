package world.danchuo.theme

/**
 * Public projection of a wave: `/api/theme/active` returns the active one and `/api/themes` the
 * released list for the switcher. [tokens] is a `key -> value` map WITHOUT the `--` prefix, which
 * the frontend injects into `:root`. PRD §5.9; DESIGN §10
 */
data class ThemeView(
    val key: String,
    val name: String,
    val tokens: Map<String, String>,
    /** The wave's layout block; `null` means the frontend takes the `layout.ts` default. §10 */
    val layout: LayoutSpec?,
    val active: Boolean,
    val releasedAt: String,
) {
    companion object {
        fun from(t: Theme) = ThemeView(
            key = t.key,
            name = t.name,
            tokens = t.tokens,
            layout = t.layout,
            active = t.active,
            releasedAt = t.releasedAt.toString(),
        )
    }
}
