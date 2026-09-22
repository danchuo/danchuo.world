# syntax=docker/dockerfile:1

# ── Build: Quarkus fast-jar on JDK 25 (the stack canon, CLAUDE.md) ──
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY . .
# gradle.properties pins org.gradle.java.home / installations.paths to the developer's
# Windows paths — strip them so Gradle in the container takes its own JAVA_HOME without
# warnings about missing directories. Tests are skipped (they need Docker-in-Docker).
# sed over gradlew removes possible CRLFs (the repo is checked out on Windows) — otherwise dash
# on Linux cannot read the shebang and fails with "./gradlew: not found".
RUN sed -i 's/\r$//' ./gradlew && chmod +x ./gradlew && \
    sed -i '/^org\.gradle\.java\./d' gradle.properties && \
    ./gradlew build -x test --no-daemon

# ── Runtime: a slim JRE, only the built fast-jar ──
FROM eclipse-temurin:25-jre AS run
WORKDIR /app
COPY --from=build /app/build/quarkus-app/ ./
EXPOSE 8080
# The packaged app's default profile is prod; datasource/token/CORS come from env.
ENTRYPOINT ["java", "-jar", "quarkus-run.jar"]
