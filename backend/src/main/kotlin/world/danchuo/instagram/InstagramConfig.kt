package world.danchuo.instagram

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Конфиг внешнего источника Instagram (PRD §5.17). Как и у Spotify: OAuth, токен и опрос
 * целиком в слайсе, ядро про источник не знает. Секреты в prod — строго из env.
 *
 * ⚠️ **Личный аккаунт сюда не подключается вовсе.** Basic Display API выключен в декабре
 * 2024-го, и официального доступа к личным аккаунтам не осталось: аккаунт владельца обязан
 * быть Professional (Creator или Business). Это не наше ограничение и обойти его нечем.
 *
 * Креды — `Optional`: до регистрации приложения их нет, и слайс обязан подниматься
 * «не сконфигурированным», а не падать ([isConfigured]). SmallRye считает пустую строку
 * отсутствием значения, поэтому именно `Optional`, а не `String` с пустым дефолтом.
 */
@ConfigMapping(prefix = "danchuo.instagram")
interface InstagramConfig {

    /** Instagram App ID приложения в Meta-дашборде (не Facebook App ID). */
    fun clientId(): Optional<String>

    /** Instagram App Secret. */
    fun clientSecret(): Optional<String>

    /**
     * Redirect URI — в точности как в списке разрешённых у приложения.
     *
     * ⚠️ Meta принимает здесь только **https**, петлевой `http://127.0.0.1` она не берёт
     * (в отличие от Spotify). Поэтому разовый OAuth проходят на боевом домене, а токен
     * переносят в локальную БД — как это уже сделано со Spotify.
     */
    fun redirectUri(): Optional<String>

    /**
     * Скоуп чтения своей ленты. `instagram_business_basic` отдаёт и медиа, и профиль,
     * и счётчики лайков/комментариев — больше для «последнего поста» ничего не нужно,
     * а лишние права пришлось бы проводить через App Review.
     */
    @WithDefault("instagram_business_basic")
    fun scopes(): String

    /** Ключ шифрования токена at-rest (PRD §8): Base64 ровно 32 байта. `openssl rand -base64 32`. */
    fun tokenEncryptionKey(): Optional<String>

    /** Включён ли фоновый забор (в `%test` выключен — иначе тесты полезли бы наружу). */
    @WithDefault("true")
    fun enabled(): Boolean

    /**
     * Интервал опроса (формат Quarkus `every`). Полчаса: пост выходит в сутки хорошо если раз,
     * а лимит Instagram — 200 вызовов в час на пользователя, так что частить незачем.
     */
    @WithDefault("30m")
    fun pollInterval(): String

    /** Куда складывать снятые картинки поста и аватара ([InstagramImageStorage]). */
    fun storageDir(): String

    /**
     * Сконфигурирован ли слайс целиком. Пока чего-то нет — публичный GET отдаёт пусто,
     * а OAuth-флоу не запускается (защита от полупустого старта).
     */
    fun isConfigured(): Boolean =
        clientId().orElse("").isNotBlank() &&
            clientSecret().orElse("").isNotBlank() &&
            redirectUri().orElse("").isNotBlank() &&
            tokenEncryptionKey().orElse("").isNotBlank()
}
