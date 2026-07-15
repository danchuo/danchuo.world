package world.danchuo.bike

import io.smallrye.config.ConfigMapping
import io.smallrye.config.WithDefault
import java.util.Optional

/**
 * Конфиг внешнего источника Велобайк (PRD §9 B4, §8) — весь поллинг/авторизация живут в слайсе,
 * ядро не знает. Значения — под префиксом `danchuo.bike`; секреты в prod строго из env.
 *
 * **Важно про Qrator.** API за антиботом Qrator, который режет не-браузерные/датацентр-запросы
 * (подтверждено реверсом: 401 + JS-челлендж даже с валидным токеном). Поэтому серверный поллинг
 * по умолчанию **выключен** ([pollEnabled]=false) и требует резидентного прокси ([proxy]) — без
 * него поедет только ручной push-ingest из уже прошедшего Qrator браузера/шортката. Это
 * сознательный риск, см. PRD §13.
 */
@ConfigMapping(prefix = "danchuo.bike")
interface VelobikeConfig {

    /** База API; per-client URL для rest-client задаётся отдельно (`quarkus.rest-client.velobike.url`). */
    @WithDefault("https://pwa.velobike.ru")
    fun baseUrl(): String

    /** Обязательные заголовки приложения, снятые реверсом. */
    @WithDefault("4.4.30")
    fun appVersion(): String

    @WithDefault("pwa-client")
    fun source(): String

    /** Телефон владельца (для SMS-логина) — формат `79XXXXXXXXX`. В prod из env. */
    fun phone(): Optional<String>

    /**
     * Ключ шифрования refresh-токена at-rest (§8): Base64 ровно 32 байта (AES-256).
     * Сгенерировать: `openssl rand -base64 32`. В prod — из env.
     */
    fun tokenEncryptionKey(): Optional<String>

    /**
     * Путь обмена refresh→access. **Не подтверждён реверсом** (рефреш не попал в HAR): задаётся
     * конфигом, чтобы поправить без пересборки, когда снимем точный эндпоинт. По умолчанию —
     * наиболее вероятный OAuth-путь у issuer `client-oauth`.
     */
    @WithDefault("api/api-auth/refresh-token")
    fun refreshPath(): String

    /** Включён ли фоновый поллер. По умолчанию выкл (Qrator + нужен прокси). */
    @WithDefault("false")
    fun pollEnabled(): Boolean

    /**
     * Интервал поллинга (формат Quarkus `every`, напр. `6h`). Читается плейсхолдером
     * `@Scheduled(every="{danchuo.bike.poll-interval}")` в [VelobikePoller]; метод здесь нужен,
     * чтобы SmallRye-валидация `@ConfigMapping` приняла свойство под префиксом `danchuo.bike`.
     */
    @WithDefault("6h")
    fun pollInterval(): String

    /** Размер страницы истории при поллинге (Spring Page). */
    @WithDefault("20")
    fun pollPageSize(): Int

    /**
     * Геокодер станций (PRD §5.13). Методы объявлены, чтобы SmallRye-валидация `@ConfigMapping`
     * приняла свойства `danchuo.bike.geocode.*` под префиксом (как [pollInterval]); реальное чтение —
     * через `@ConfigProperty`/`@Scheduled`-плейсхолдер в [StationGeocoder].
     */
    fun geocode(): Geocode

    interface Geocode {
        /** Включён ли фоновый геокодер (в `%test` выключен). */
        @WithDefault("true")
        fun enabled(): Boolean

        /** Интервал тика (формат Quarkus `every`) — читается плейсхолдером в [StationGeocoder]. */
        @WithDefault("5s")
        fun interval(): String

        /** `User-Agent` для Nominatim (usage policy требует идентификацию приложения). */
        @WithDefault("danchuo.world/1.0 (https://danchuo.world)")
        fun userAgent(): String
    }

    /** Сконфигурирован ли слайс для серверного поллинга (есть ключ шифрования). */
    fun isConfigured(): Boolean = tokenEncryptionKey().orElse("").isNotBlank()
}
