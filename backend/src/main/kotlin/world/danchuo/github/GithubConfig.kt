package world.danchuo.github

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault

/**
 * Конфиг сборщика вкладов GitHub (PRD §5.4, реестр I-01) — внешний источник целиком в
 * своём слайсе, ядро о нём не знает (как `spotify`/`bike`).
 *
 * Секретов здесь нет и не должно быть: канал публичный, токен не нужен вовсе (почему
 * именно так — во врезе [ContributionCalendarParser]). Единственное, что стоит помнить:
 * ходим мы на **обычную страницу**, а не в API, поэтому интервал держим скромным и
 * представляемся честным `User-Agent` — та же вежливость, что с Nominatim в слайсе `bike`.
 */
@ConfigMapping(prefix = "danchuo.github")
interface GithubConfig {

    /** Включён ли фоновый сбор. Выключение = плитка живёт на уже собранном. */
    @WithDefault("true")
    fun enabled(): Boolean

    /** Логин, чей календарь собираем. */
    @WithDefault("danchuo")
    fun username(): String

    /**
     * Интервал сбора (формат Quarkus `every`). Читается плейсхолдером в
     * [GithubContributionCollector]; метод здесь — чтобы SmallRye принял свойство под префиксом.
     */
    @WithDefault("30m")
    fun pollInterval(): String

    /** Кем представляемся публичной странице. */
    @WithDefault("danchuo.world/1.0 (https://danchuo.world)")
    fun userAgent(): String
}
