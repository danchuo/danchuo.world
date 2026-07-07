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

    // Планировщик (@Scheduled) — фоновый поллинг истории поездок Велобайка (слайс bike).
    // Живёт только в слайсе bike; ядро о нём не знает.
    implementation("io.quarkus:quarkus-scheduler")

    // EXIF-ориентация фото-дропов (B1, слайс film): телефонные JPEG несут поворот в EXIF,
    // ImageIO его не применяет — читаем тег и доворачиваем при ресайзе. Лёгкая зависимость,
    // живёт только в слайсе film (ядро о ней не знает).
    implementation("com.drewnoakes:metadata-extractor:2.19.0")

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
    // Десериализация Kotlin-DTO в чистых юнит-тестах (рантайм-модуль quarkus не виден компилятору теста).
    testImplementation("com.fasterxml.jackson.module:jackson-module-kotlin")
}

group = "world.danchuo"
// M3: бэк и фронт получили рабочие версии — версии разведены
// (CLAUDE.md §версионирование). Волна 02 «Obscura» (рестайл темы + слой скинов) — feature → minor бэка.
version = "0.13.0-SNAPSHOT"

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
}
