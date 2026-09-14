package world.danchuo.telegram

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault

/**
 * Конфиг визитки Telegram (PRD §5.18) — внешний источник целиком в своём слайсе, ядро о нём
 * не знает.
 *
 * Секретов здесь нет и быть не может: страница `t.me/{ник}` публична, ключа не существует
 * (почему канал именно такой — во врезе [TelegramProfileParser]). Как и с календарём вкладов,
 * ходим мы на **обычную страницу**, поэтому интервал держим скромным и представляемся честным
 * `User-Agent`.
 */
@ConfigMapping(prefix = "danchuo.telegram")
interface TelegramConfig {

    /** Включён ли фоновый забор. Выключение = карточки на борде просто нет. */
    @WithDefault("true")
    fun enabled(): Boolean

    /** Чью визитку показываем. Ник на борде всегда один — владельца. */
    @WithDefault("danchuo")
    fun username(): String

    /**
     * Интервал забора (формат Quarkus `every`). Читается плейсхолдером в
     * [TelegramProfileCollector]; метод здесь — чтобы SmallRye принял свойство под префиксом.
     *
     * Час: имя, статус и аватарка меняются реже, чем что угодно другое на борде.
     */
    @WithDefault("1h")
    fun pollInterval(): String

    /** Кем представляемся публичной странице. */
    @WithDefault("danchuo.world/1.0 (https://danchuo.world)")
    fun userAgent(): String
}
