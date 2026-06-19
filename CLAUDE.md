# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Текущее состояние репозитория

**Эра M4 (статика/темы/аналитика) готова.** Бэкенд: спина данных M1 + read-API дня/календаря (M2) + слайс `spotify` (M3) + контент-слайсы `projects`/`social`, система тем `theme` (токены **и layout-per-wave** в JSONB → инжект в `:root` / раскладка борда), приватная аналитика `analytics` (cookieless бикон), каркас фото-дропов `film` + мягкий рейтлимит публичных GET. Фронт: борд наполнен живыми тайлами (проекты, соцссылки, marquee артефактов, hero, фото-дропы + модалка, переключатель волн), SSR-инжект токенов **и раскладки** активной волны, JS-бикон аналитики. Дальше — эра M5 (полировка/адаптив/запуск).

- `docs/PRD-danchuoworld.md` — **что** строим: функциональные требования, acceptance criteria, модель данных, этапы M0–M5 + бэклог.
- `docs/DESIGN.md` — **как** это выглядит и ощущается: источник правды по дизайну (волна 01, токены, bento-сетка, состояния).
- `examples/wave01-desktop.html`, `examples/wave01-mobile.html` — статические вайрфреймы волны 01; `examples/explore-depth.html` — эксплорация глубины/рамки (референс, **не продакшн-код**).
- `backend/` — Quarkus (Kotlin), Gradle. Feature-пакеты (вертикальные слайсы, PRD §3.1) + `core` (сквозные соглашения).
  - **M1 наполнены:** `days` (`DayRecord` + `DayRecordService` — единая точка записи дня, генезис-гард), `health` (`Workout`, `POST /api/ingest/health`), `checklist` (`ChecklistItem`/`ChecklistEntry`, `POST /api/ingest/daily`, пункт `monster` — производная от вкуса), `monster` (`MonsterFlavor`, data-driven вкусы). Сиды пунктов и вкусов — в Liquibase. Ingest идемпотентен (upsert по дате), null ≠ 0 (§5.4).
  - **M2 (бэкенд) готов:** `days` дополнен агрегатором (`DayAggregator`) и публичными `GET /api/days/{date}` (полная проекция `DayView`) + `GET /api/days?from=&to=` (сводки `DaySummary` для календаря/мини-графика). Все GET публичны, генезис-гард, null ≠ 0.
  - **M3 (бэкенд) готов:** слайс `spotify` — внешний источник целиком в своём пакете, ядро не тронуто. `SpotifyConfig` (креды/скоупы/ключ из env), `SpotifyToken` + `SpotifyCrypto` (refresh-токен шифрованно at-rest, AES-GCM), `SpotifyTokenService` (one-time обмен кода + прозрачный рефреш access-токена), `SpotifyAuthResource` (`GET /api/ingest/spotify/authorize` за bearer + публичный `GET /api/spotify/callback` со сверкой `state`), REST-клиенты к Spotify + `SpotifyService` с Caffeine-кэшем (now-playing ~20с, recent/top — минуты), публичные `GET /api/spotify/{now-playing,recent,top}`. Не сконфигурирован/не подключён ⇒ пустая форма (200), не падение.
  - **M4 (бэкенд) готов:** контент-слайсы `projects` (`GET /api/projects`) и `social` (`SocialLink`+`Artifact`, `GET /api/social-links`/`/api/artifacts`); `theme` — волны с токенами **и опциональным layout-блоком** в JSONB (`Theme`, `@JdbcTypeCode(JSON)`; `LayoutSpec` — переопределение спанов/видимости/грида/мобильного порядка, бэкенд хранит как непрозрачный JSON), `GET /api/theme/active` (кэш, отдаёт `tokens`+`layout`) + `GET /api/themes`, сид волны 01 = весь токен-набор из `globals.css` (layout=null ⇒ дефолт фронта) + демо-«Волна 02» с layout-дельтой; `analytics` — cookieless-телеметрия (сырой IP не хранится, только суточный хэш `VisitorHash`), публичный `POST /api/analytics/beacon` + фильтр ботов `BotHeuristics` + приватная сводка `GET /api/ingest/analytics/summary` (за bearer); `film` — каркас фото-дропов (`FilmDrop`/`FilmPhoto`, `GET /api/drops*`, пусто до B1-загрузки). Артефакты могут быть без картинки (`Artifact.imageUrl` nullable — marquee рисует пиксель-плейсхолдер). Сиды/схема — Liquibase `0060`–`0120`.
  - **Ещё пустые швы (M5+):** индикатор свежести данных (`lastIngestAt`).
  - `core` содержит bearer-фильтр (`/api/ingest/*`), мягкий рейтлимит публичных GET (`RateLimitFilter`, in-memory токен-бакет по IP), MSK/генезис-конфиг и кэш-шов.
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind v4. Публичный JSON-клиент к Quarkus (только чтение).
  - **M2 каркас:** токены волны 01 в `:root` (`src/app/globals.css` — теперь **дефолт-фолбэк**, поверх которого M4 инжектит токены из БД), data-driven layout-конфиг тайлов (`src/lib/layout.ts`, bento 20×14), плитка «Сегодня»/календарь/статы + недельная полоса на мобиле, per-tile состояния (loading/empty/error/loaded).
  - **M3:** `MusicTile` (`src/components/MusicTile.tsx`) — живой слой Spotify; тянет `/api/spotify/now-playing` (опрос на интервале) + `/api/spotify/recent` сам, независимо от выбранного дня. Пусто ⇒ «ничего не играет».
  - **M4:** контентные тайлы (`ProjectsTile`/`SocialTile`/`ArtifactMarquee`/`HeroTile`/`PhotoDropsTile`+`PhotoDropModal`) — каждый тянет свой источник сам (общий шов `useTileData`, per-tile состояния); `WaveSwitcher` — клиентский своп волны через контекст `WaveProvider` (токены в `:root` + раскладка борда); SSR-инжект токенов **и layout** активной волны (`layout.tsx` токены в `<head>`, `page.tsx` → `WaveProvider`, без вспышки, фолбэк на `globals.css`/`layout.ts`); `AnalyticsBeacon` — cookieless JS-бикон (load + dwell на уходе). Остаётся пустой шов: `freshness` (M5).
  - **Layout-per-wave (`src/lib/layout.ts`):** `TileSpan.hidden` + `resolveLayout(wave)` — мерж layout-блока волны **поверх** дефолта `TILE_LAYOUT` (волна задаёт дельту: переставить/ресайзить/спрятать тайлы, грид, мобильный порядок). Реестр тайлов (`TileId`) за кодом; неизвестные коду тайлы игнорируются; `waveSwitcher` спрятать нельзя; `null` ⇒ чистый дефолт. `Board` рендерит из `useWave().layout`. Добавление волны = запись в БД с опц. `layout`-JSON, без правок кода. См. DESIGN §10.1.
  - Тесты — Vitest + React Testing Library (`*.test.ts(x)` рядом с кодом).

### Версии стека (самые свежие, что тянем — см. память `latest-stack-preference`)
- **Java 25** нативно (toolchain + Gradle-демон через `org.gradle.java.home`); байткод-таргет 25 (Java и Kotlin консистентно).
- **Quarkus 3.31.2**, **Kotlin 2.3.20**, **Gradle 9.5.1** (wrapper).
- Миграции — **Liquibase** (а не Flyway): `quarkus-liquibase`, мастер `backend/src/main/resources/db/changelog/db.changelog-master.xml`, слайсы кладут чейнджлоги в `db/changelog/changes/`.

### Команды бэкенда (запускать из корня репо)
- Сборка без тестов: `./backend/gradlew -p backend build -x test`
- Dev-режим (hot reload, поднимает Postgres через Dev Services — **нужен Docker**): `./backend/gradlew -p backend quarkusDev`
- Тесты: `./backend/gradlew -p backend test` (требуют Docker для Dev Services Postgres)
- JDK для Gradle зашит в `backend/gradle.properties` (`D:/Programms/Java/jdk-25`); на другой машине — поправить путь.

### Команды фронта (запускать из `frontend/`)
- Установка: `npm ci` (или `npm install`)
- Dev-сервер: `npm run dev` (ожидает бэкенд на `NEXT_PUBLIC_API_BASE_URL`, дефолт `http://localhost:8080` — см. `.env.example`)
- Тесты: `npm run test` (Vitest); типы: `npm run typecheck`; прод-сборка: `npm run build`
- shadcn пока не подключён — добавим, когда понадобятся его компоненты.

## Документы — кто за что отвечает

PRD и DESIGN — разделённые источники правды, не дублируй между ними:
- **PRD** = функциональность и acceptance criteria. Визуал описывается нейтрально («стиль активной волны»), без привязки к конкретной волне.
- **DESIGN** = визуальная спецификация. Только здесь обсуждается пиксельный слой и конкретика волны 01.
- При изменениях, затрагивающих обе плоскости, правь оба и держи их согласованными (см. память проекта про синхронизацию PRD/DESIGN).

## Планируемая архитектура (big picture)

Расцепленный монолит, **не** микросервисы:
- **Бэкенд:** Quarkus (Kotlin), REST JSON API, PostgreSQL + Hibernate Panache, миграции **Liquibase** (заменили Flyway). Кэш — quarkus-cache (Caffeine, in-process; Redis сознательно не нужен в v1). Рейтлимит — Bucket4j + L7 в Caddy.
- **Фронт:** Next.js App Router, изолирован в JSON-клиента к Quarkus.
- **Деплой:** Docker Compose (app + postgres + caddy), GitHub Actions → GHCR → ssh на VPS. Caddy = TLS + reverse-proxy + отдача статики Next.js.

### Сквозные соглашения (легко нарушить, читать до правок данных)

- **Канонический часовой пояс — MSK (UTC+3).** Все «дни», границы суток (полночь MSK) и агрегаты считаются в MSK независимо от tz сервера/посетителя. Ось данных — `LocalDate` в MSK.
- **Сон относится ко дню пробуждения.** `sleepMinutes` дня D = сессия сна, завершившаяся пробуждением в день D.
- **Генезис-дата** в конфиге — отсчёт данных; раньше неё пусто. Будущие дни рендерятся пустыми.
- **Все данные публичны на чтение.** Защищается не контент, а **креды записи**: мутирующие эндпоинты (`/api/ingest/*`) — за статическим bearer-токеном в `Authorization`; все GET публичны. Ingest идемпотентен (upsert по дате).
- **Источник данных с телефона — push, не pull.** iOS-шорткаты постят на ingest (Health авто 12/18/24 MSK; чеклист/монстр/имя дня — интерактивный шорткат). Облачного API у Apple нет.
- **Spotify** опрашивается живьём; refresh-токен шифруется at-rest; Caffeine-кэш гасит нагрузку (now-playing TTL ~20с).

### Дизайн-архитектура (DESIGN.md — правда)

- **Ноль хардкод-цветов/размеров в компонентах.** Все визуальные значения — design tokens (CSS-переменные), хранятся в БД (JSONB), инжектятся в `:root`. `GET /api/theme/active` отдаёт токены активной волны.
- **Система «волн»:** волна = именованный визуальный стиль (палитра/типографика/декор-слой/layout-спаны), сменяемый по релизам. Смена активной волны меняет весь сайт без правок компонентов; волна может переопределять спаны плиток bento.
- **Волна 01 = «пиксель-персик».** Пиксельный слой — тонкая надстройка ПОВЕРХ чистой AA-базы: живёт только в рамках/иконках/акцентах/лоадерах/календаре, **никогда** в основном тексте, цифрах-данных и навигации. При сомнении: clarity > pixel-craft.
- **Bento 20×14**, плитка «Сегодня» — доминанта; борд виден без скролла на ≥1440px. Per-tile состояния (loading/empty/error/loaded), общего спиннера нет. Mobile <640px — одноколоночный стек + недельная полоса вместо календаря-сетки.

## Известные ограничения / решённые вопросы

- **Экранное время (Apple) программно недоступно.** Нет в HealthKit; Screen Time API (DeviceActivity) рендерит отчёт в песочнице-расширении и **не отдаёт сырые числа** наружу. Пока нет реального канала забрать данные с айфона — **не добавлять сущность/эндпоинт** под это (fallback — ручной ввод, поле `screenTimeMinutes` уже есть в DayRecord). См. PRD §9 (бэклог B2).
- Вуш/Юрент, прогресс книг, история подкастов — аналогично без публичного API → ручной ввод/research (PRD §9).

## Рабочий процесс

- Изменения идут через **feature-ветку + PR**, не напрямую в `main` (см. память проекта).
- Коммиты: маркированный список изменений; крупные задачи разбивать; в сообщениях коммитов **не упоминать AI/ассистента** (см. память проекта).
- **Максимум 3 коммита в ветке.** Мелкие правки по ходу ревью не плодят отдельные коммиты — если их становится больше трёх, история логически сквошится (обычно по слоям: бэкенд+инфра / фронт / доки), а сообщения объединяются в маркированные списки. Это до пуша/PR — переписывать историю уже отправленной ветки нельзя.
- **Версионирование.** В начале каждой новой ветки `feature/*` или `hotfix/*` инкрементить версию проекта первым коммитом ветки (feature → minor, hotfix → patch; semver). Пока бэк и фронт не разведены, версия одна. Когда у обоих появятся хотя бы еле рабочие версии — держать **две независимые версии** (отдельно фронт, отдельно бэк) и инкрементить ту часть, которой касается ветка (ветка, трогающая обе, — обе).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **danchuo.world** (1444 symbols, 2922 relationships, 109 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/danchuo.world/context` | Codebase overview, check index freshness |
| `gitnexus://repo/danchuo.world/clusters` | All functional areas |
| `gitnexus://repo/danchuo.world/processes` | All execution flows |
| `gitnexus://repo/danchuo.world/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
