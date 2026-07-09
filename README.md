# danchuo.world

Личный сайт-дашборд: публичный bento-борд моей жизни в реальном времени — день и его имя, сон/шаги/тренировки из Apple Health, дисциплина картой-тропой «утро → ночь», музыка из Spotify, поездки на Велобайке, плёночные фото-дропы. Визуал живёт «волнами» — сменными стилями-релизами (токены + раскладка + скин), переключаемыми прямо на сайте без правок кода. Данные заливаются с телефона iOS-шорткатами (push, не pull), все чтения публичны.

**Прод:** https://danchuo.world

**Стек**

- **Бэкенд:** Quarkus (Kotlin, Java 25), REST JSON, PostgreSQL + Hibernate Panache, миграции Liquibase; прод — GraalVM native-image. Архитектура — расцепленный монолит из вертикальных слайсов (`days`, `spotify`, `film`, `bike`, `theme`, …).
- **Фронт:** Next.js (App Router) + TypeScript + Tailwind v4; изолированный JSON-клиент к API.
- **Тесты:** Vitest + React Testing Library, JUnit/RestAssured, визуальная регрессия Playwright (эталоны в Docker).
- **Инфра:** Docker Compose, Caddy (TLS/reverse-proxy), GitHub Actions → GHCR → VPS; смоук гоняет собранные образы до выката.

**Структура**

- `backend/` / `frontend/` — код; `docs/PRD-danchuoworld.md` — что строим; `docs/DESIGN.md` — как выглядит; `docs/deploy.md` — выкатка.

**Запуск локально:** `docker compose up --build` → сайт на `http://localhost:3000`, API на `:8080`.

**Релизы:** каждая раскатка в прод фиксируется GitHub-релизом со ссылками на собранные GHCR-образы (`:sha` — ручка отката) и версиями бэка/фронта.

---

# danchuo.world

Personal dashboard site: a public real-time bento board of my life — the day and its name, sleep/steps/workouts from Apple Health, discipline as a "morning → night" quest-map trail, Spotify music, Velobike rides, film photo drops. The visuals live in "waves" — swappable style releases (tokens + layout + skin) switchable right on the site with no code changes. Data is pushed from the phone via iOS Shortcuts (push, not pull); all reads are public.

**Production:** https://danchuo.world

**Stack**

- **Backend:** Quarkus (Kotlin, Java 25), REST JSON, PostgreSQL + Hibernate Panache, Liquibase migrations; production runs as a GraalVM native image. Architecture — a decoupled monolith of vertical slices (`days`, `spotify`, `film`, `bike`, `theme`, …).
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind v4; an isolated JSON client to the API.
- **Tests:** Vitest + React Testing Library, JUnit/RestAssured, Playwright visual regression (baselines shot in Docker).
- **Infra:** Docker Compose, Caddy (TLS/reverse proxy), GitHub Actions → GHCR → VPS; the smoke stage exercises the freshly built images before rollout.

**Layout**

- `backend/` / `frontend/` — code; `docs/PRD-danchuoworld.md` — what we build; `docs/DESIGN.md` — how it looks; `docs/deploy.md` — deployment.

**Run locally:** `docker compose up --build` → site at `http://localhost:3000`, API at `:8080`.

**Releases:** every production rollout is recorded as a GitHub Release linking the built GHCR images (`:sha` — the rollback handle) and the backend/frontend versions.
