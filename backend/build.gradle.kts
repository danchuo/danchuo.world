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

    // Outgoing HTTP to external APIs (Spotify Web API plus accounts OAuth, PRD §M3).
    // Lives only in the spotify slice — the core knows nothing of external sources.
    implementation("io.quarkus:quarkus-rest-client-jackson")

    // Persistence: Hibernate ORM Panache (Kotlin) plus PostgreSQL
    implementation("io.quarkus:quarkus-hibernate-orm-panache-kotlin")
    implementation("io.quarkus:quarkus-jdbc-postgresql")

    // Schema migrations are Liquibase (which replaced Flyway)
    implementation("io.quarkus:quarkus-liquibase")

    // In-process cache (Caffeine) — Redis is deliberately unnecessary in v1 (PRD §8)
    implementation("io.quarkus:quarkus-cache")

    implementation("io.quarkus:quarkus-arc")

    // Health endpoints (/q/health/*) for the CI smoke stage and the deploy health gate:
    // readiness includes the Agroal datasource check, so "ready" = DB is reachable too.
    implementation("io.quarkus:quarkus-smallrye-health")

    // AWT support for GraalVM native image: the film slice resizes frames via JDK ImageIO
    // (java.awt), which native-image can't compile without this extension. No-op in JVM mode.
    implementation("io.quarkus:quarkus-awt")

    // The scheduler (@Scheduled) polls Velobike's ride history in the background.
    // Lives only in the bike slice; the core knows nothing of it.
    implementation("io.quarkus:quarkus-scheduler")

    // EXIF orientation for photo drops (the film slice): phone JPEGs carry rotation in EXIF and
    // ImageIO does not apply it, so we read the tag and rotate while resizing. A light dependency
    // living only in the film slice.
    implementation("com.drewnoakes:metadata-extractor:2.19.0")

    // Reading the Anx Reader shelf (PRD §5.16): the reader syncs its whole SQLite over WebDAV and
    // all reading statistics live inside it. The driver is for that one file only — it is not
    // wired into Quarkus datasources; the slice opens it itself, read-only.
    implementation("org.xerial:sqlite-jdbc:3.51.0.0")

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
    // Deserialising Kotlin DTOs in pure unit tests (Quarkus's runtime module is invisible there).
    testImplementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    // Stub for Groq's OpenAI-compatible API in llm-slice tests — exercises the real HTTP/JSON
    // path of GroqLlmClient without spending tokens (same approach as proxemics).
    testImplementation("org.wiremock:wiremock-standalone:3.13.0")
}

group = "world.danchuo"
// Backend and frontend carry independent versions (CLAUDE.md, "Versioning").
version = "1.34.3"

// The freshest LTS is Java 25 (toolchain and runtime).
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

// Bytecode target 25, kept consistent for Java and Kotlin.
tasks.withType<JavaCompile>().configureEach {
    options.release.set(25)
}

// CDI, JAX-RS and JPA need open classes; Kotlin classes are final by default.
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
    // into the suite and it would spend paid quota.

    // Blank the environment variables the .env feeds, not the properties themselves — env beats
    // .env, while tests that stub a provider still set `danchuo.*.api-key` directly and win.
    environment("DANCHUO_LLM_API_KEY", "")
    environment("GEMINI_API_KEY", "")
}
