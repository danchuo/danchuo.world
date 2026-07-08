# syntax=docker/dockerfile:1

# ── Сборка: Quarkus fast-jar на JDK 25 (канон стека, CLAUDE.md) ──
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY . .
# gradle.properties пинит org.gradle.java.home / installations.paths на Windows-пути
# разработчика — вырезаем их, чтобы Gradle в контейнере взял свой JAVA_HOME без
# предупреждений о несуществующих каталогах. Тесты пропускаем (нужен Docker-in-Docker).
# sed по gradlew убирает возможные CRLF (репо чекаутится на Windows) — иначе dash
# в Linux не прочитает shebang и упадёт с «./gradlew: not found».
RUN sed -i 's/\r$//' ./gradlew && chmod +x ./gradlew && \
    sed -i '/^org\.gradle\.java\./d' gradle.properties && \
    ./gradlew build -x test --no-daemon

# ── Рантайм: тонкий JRE, только собранный fast-jar ──
FROM eclipse-temurin:25-jre AS run
WORKDIR /app
COPY --from=build /app/build/quarkus-app/ ./
EXPOSE 8080
# Профиль по умолчанию у упакованного приложения — prod; датасорс/токен/CORS приходят из env.
ENTRYPOINT ["java", "-jar", "quarkus-run.jar"]
