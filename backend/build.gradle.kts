plugins {
    kotlin("jvm") version "2.3.20"
    kotlin("plugin.allopen") version "2.3.20"
    id("io.quarkus") version "3.31.2"
}

repositories {
    mavenCentral()
    mavenLocal()
}

val quarkusPlatformGroupId: String by project
val quarkusPlatformArtifactId: String by project
val quarkusPlatformVersion: String by project

dependencies {
    implementation(enforcedPlatform("$quarkusPlatformGroupId:$quarkusPlatformArtifactId:$quarkusPlatformVersion"))

    // REST JSON API (PRD §3)
    implementation("io.quarkus:quarkus-rest")
    implementation("io.quarkus:quarkus-rest-jackson")
    implementation("io.quarkus:quarkus-kotlin")

    // Исходящий HTTP к внешним API (Spotify Web API + accounts OAuth, PRD §M3).
    // Живёт только в слайсе spotify — ядро внешних источников не знает.
    implementation("io.quarkus:quarkus-rest-client-jackson")

    // Постоянство: Hibernate ORM Panache (Kotlin) + PostgreSQL
    implementation("io.quarkus:quarkus-hibernate-orm-panache-kotlin")
    implementation("io.quarkus:quarkus-jdbc-postgresql")

    // Миграции схемы — Liquibase (вместо Flyway)
    implementation("io.quarkus:quarkus-liquibase")

    // In-process кэш (Caffeine) — Redis сознательно не нужен в v1 (PRD §8)
    implementation("io.quarkus:quarkus-cache")

    implementation("io.quarkus:quarkus-arc")

    // Health endpoints (/q/health/*) for the CI smoke stage and the deploy health gate:
    // readiness includes the Agroal datasource check, so "ready" = DB is reachable too.
    implementation("io.quarkus:quarkus-smallrye-health")

    // AWT support for GraalVM native image: the film slice resizes frames via JDK ImageIO
    // (java.awt), which native-image can't compile without this extension. No-op in JVM mode.
    implementation("io.quarkus:quarkus-awt")

    // Планировщик (@Scheduled) — фоновый поллинг истории поездок Велобайка (слайс bike).
    // Живёт только в слайсе bike; ядро о нём не знает.
    implementation("io.quarkus:quarkus-scheduler")

    // EXIF-ориентация фото-дропов (B1, слайс film): телефонные JPEG несут поворот в EXIF,
    // ImageIO его не применяет — читаем тег и доворачиваем при ресайзе. Лёгкая зависимость,
    // живёт только в слайсе film (ядро о ней не знает).
    implementation("com.drewnoakes:metadata-extractor:2.19.0")

    // Чтение полки Anx Reader (PRD §5.16, слайс reading): читалка синкает по WebDAV свою
    // SQLite-базу целиком, и статистика чтения живёт только внутри неё. Драйвер нужен ровно
    // для этого одного файла — в JDBC-датасорсы Quarkus не подключается, слайс открывает его
    // сам, read-only. Живёт только в слайсе reading; ядро о нём не знает.
    implementation("org.xerial:sqlite-jdbc:3.51.0.0")

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
    // Десериализация Kotlin-DTO в чистых юнит-тестах (рантайм-модуль quarkus не виден компилятору теста).
    testImplementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    // Stub for Groq's OpenAI-compatible API in llm-slice tests — exercises the real HTTP/JSON
    // path of GroqLlmClient without spending tokens (same approach as proxemics).
    testImplementation("org.wiremock:wiremock-standalone:3.13.0")
}

group = "world.danchuo"
// M3: бэк и фронт получили рабочие версии — версии разведены (CLAUDE.md §версионирование).
// 1.1.0 — окно ручного ввода дня (ingest-window) + фикс варнингов docker-сборок.
// 1.2.0 — слайс llm: клиент внешней LLM (Groq, текст + vision) за интерфейсом LlmClient.
// 1.3.0 — B9: LLM-валидация/автоисправление поворота кадров фото-дропов (слайс film).
// 1.4.0 — удаление одного кадра дропа (админка) + лимит выдачи GET /api/rides (67 последних).
// 1.4.2 — GET /api/rides отдаёт поездки текущего года (фолбэк — последняя, если года пустой); лимит 67 снят.
// 1.7.1 — сон в 0 минут при ingest'е нормализуется в «сна не было» (null + null-фазы).
// 1.7.2 — перекомпоновка layout волны 02 «Obscura» (миграция 0170, данные): «аркадный автомат в небе».
version = "1.19.0"

// Самый свежий LTS — Java 25 (toolchain/рантайм). См. память проекта latest-stack-preference.
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

// Байткод-таргет 25 (Kotlin 2.3 умеет JVM 25). Java и Kotlin держим консистентно.
tasks.withType<JavaCompile>().configureEach {
    options.release.set(25)
}

// CDI/JAX-RS/JPA требуют open-классов; Kotlin-классы final по умолчанию.
allOpen {
    annotation("jakarta.ws.rs.Path")
    annotation("jakarta.enterprise.context.ApplicationScoped")
    annotation("jakarta.persistence.Entity")
    annotation("io.quarkus.test.junit.QuarkusTest")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_25)
        javaParameters.set(true)
    }
}

tasks.test {
    systemProperty("java.util.logging.manager", "org.jboss.logmanager.LogManager")
    // Tests must never call an external model. Quarkus reads backend/.env at a HIGHER precedence
    // than application.properties (even the %test profile), so a developer's real keys would leak
    // into the suite: it would spend paid quota and its results would depend on the network.
    // Blank the environment variables the .env feeds, not the properties themselves — env beats
    // .env, while tests that stub a provider still set `danchuo.*.api-key` directly and win.
    environment("DANCHUO_LLM_API_KEY", "")
    environment("GEMINI_API_KEY", "")
}
