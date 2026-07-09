# [danchuo.world](https://danchuo.world)

Личный сайт-дашборд: публичный bento-борд моей жизни в реальном времени — день и его имя, сон/шаги/тренировки из Apple Health, дисциплина картой-тропой «утро → ночь», музыка из Spotify, поездки на Велобайке, плёночные фото-дропы. Визуал живёт «волнами» — сменными стилями-релизами (токены + раскладка + скин), переключаемыми прямо на сайте без правок кода. Данные заливаются с телефона iOS-шорткатами (push, не pull), все чтения публичны.

---

Personal dashboard site: a public real-time bento board of my life — the day and its name, sleep/steps/workouts from Apple Health, discipline as a "morning → night" quest-map trail, Spotify music, Velobike rides, film photo drops. The visuals live in "waves" — swappable style releases (tokens + layout + skin) switchable right on the site with no code changes. Data is pushed from the phone via iOS Shortcuts (push, not pull); all reads are public.

<h2 align="center"><a href="https://danchuo.world">danchuo.world</a></h2>

**Stack**

- **Backend:** Quarkus (Kotlin, Java 25), REST JSON, PostgreSQL + Hibernate Panache, Liquibase migrations; production runs as a GraalVM native image. Architecture — a decoupled monolith of vertical slices (`days`, `spotify`, `film`, `bike`, `theme`, …).
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind v4; an isolated JSON client to the API.
- **Tests:** Vitest + React Testing Library, JUnit/RestAssured, Playwright visual regression (baselines shot in Docker).
- **Infra:** Docker Compose, Caddy (TLS/reverse proxy), GitHub Actions → GHCR → VPS; the smoke stage exercises the freshly built images before rollout.
