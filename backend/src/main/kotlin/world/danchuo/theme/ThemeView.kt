package world.danchuo.theme

/**
 * Публичная проекция волны (PRD §5.9; DESIGN §10). `GET /api/theme/active` отдаёт активную,
 * `GET /api/themes` — список выпущенных (для переключателя). [tokens] — карта `ключ → значение`
 * (без `--`), которую фронт инжектит в `:root`.
 */
data class ThemeView(
    val key: String,
    val name: String,
    val tokens: Map<String, String>,
    /** Layout-блок волны (DESIGN §3, §10); `null` ⇒ фронт берёт дефолт `layout.ts`. */
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
