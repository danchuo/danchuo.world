# CLAUDE.md

Рабочая инструкция для Claude Code в этом репозитории: соглашения, команды,
карта кода. **Хроника веток здесь не живёт** — она в `docs/journal.md`.

## Где мы сейчас

**Раздел перезаписывается, а не пополняется.** Здесь только живое состояние — не список
сделанных веток и не «последняя / перед этим / ещё раньше». Что сделала ветка, живёт в её
PR и сообщении коммита; правило — в PRD/DESIGN; архив первого года — `docs/journal.md`.

- Версии: **бэк 1.22.2, фронт 1.28.5**.
- **Бесплатная полоса LLM — `openai/gpt-oss-120b` с `reasoning-effort=low`** (прежняя llama-3.3-70b
  выбыла у Groq). Модели провайдера — расходник: пропали пересказы — сперва сверь `free-model` со
  списком живых моделей, см. `docs/pitfalls.md`.
- **Edge собирается свой** (`caddy/Dockerfile`: caddy + `rate_limit` + `cache`). Валидировать
  `Caddyfile` стоковым `caddy:2` больше нельзя — он не знает этих директив.
- Оговорки «с какого дня у нас есть эти данные» живут в PRD, рядом со своей фичей.

## Документы — кто за что отвечает

PRD и DESIGN — разделённые источники правды, не дублируй между ними:
- **PRD** = функциональность и acceptance criteria. Визуал описывается нейтрально («стиль активной волны»), без привязки к конкретной волне.
- **DESIGN** = визуальная спецификация. Только здесь обсуждается пиксельный слой и конкретика волны 01.
- При изменениях, затрагивающих обе плоскости, правь оба и держи их согласованными (см. память проекта про синхронизацию PRD/DESIGN).
- **`docs/journal.md`** = **архив** хроники веток за первый год (заморожен,
  не пополняется). Ценен отвергнутыми вариантами, замерами и разобранными поломками — их нет
  ни в коде, ни в PRD/DESIGN. Перед тем как переделывать что-то странное на вид,
  грепни здесь: возможно, этот путь уже проходили и откатили.
- `docs/deploy.md` — чеклист раскатки, секреты, откат.
- `docs/pitfalls.md` — подводные камни инструментов: симптомы, которые выглядят поломкой кода,
  а на деле свойство инструмента. Диагностический список, а не правила проекта.
- `docs/artifact-detection-notes.md` — рабочий журнал поиска артефактов на кадрах.

## Карта репозитория

`backend/` — Quarkus (Kotlin), Gradle. Вертикальные слайсы (PRD §3.1) + `core`.
Слайс держит внешний источник целиком у себя; ядро не знает о нём.

| слайс | о чём | публичные точки |
|---|---|---|
| `days` | ядро дня: `DayRecord`, `DayRecordService` (единая точка записи, генезис-гард), `DayAggregator`, свежесть | `GET /api/days/{date}`, `GET /api/days?from=&to=`, `GET /api/freshness` |
| `health` | приём с iOS-шортката: шаги, сессионизация сна (`SleepSessionizer`), дневник (`JournalDetector`) | `POST /api/ingest/health` |
| `checklist` | пункты дисциплины и отметки | `POST /api/ingest/daily` |
| `monster` | вкусы монстра (data-driven); пункт `monster` — производная от вкуса | — |
| `spotify` | OAuth, refresh шифрованно at-rest, Caffeine-кэш; поллер подкастов (`@Scheduled` 60с → `podcast_session`, пункт `podcasts` — производная от минут; сессия помнит и КУСОК эпизода: `start_progress_ms`→`last_progress_ms`); `PodcastSummarySource` — текст прослушанного куска: каталог Apple → RSS → окна аудио по `Range` → распознавание | `GET /api/spotify/{now-playing,recent,top}` |
| `github` | вклады из HTML-фрагмента профиля, `@Scheduled`; не двигает лампу свежести | едут в `DaySummary` |
| `reading` | полка Anx Reader по WebDAV: SQLite читалки → сессии чтения (`@Scheduled` 5м → `reading_session`, пункт `reading` — производная от минут); `ReadingSummarySource` — откуда взять текст прочитанного куска (epub с полки) | `GET /api/reading/cover/{id}` |
| `summary` | пересказ пройденного за заход куска, **общий на все источники**: очередь и попытки (`content_summary`, ключ `kind`+`sessionId`), чистые `SummaryPolicy`/`SummaryWindows`, промпт со словарём по виду, один `SummaryPoller` (`@Scheduled` 2м, бесплатная полоса LLM) на всех. Слайсы дают текст через `SummarySource` | `GET /api/summary/{kind}/{id}` |
| `bike` | Велобайк: поездки, покупки тарифов, геокодинг станций (Nominatim) | `GET /api/rides`, `/api/rides/stats` |
| `film` | фото-дропы: zip → web+thumb, поворот кадров через LLM, поиск артефактов | `GET /api/drops`, `/api/film-media/…` |
| `llm` | клиент внешних LLM за `LlmClient` (Groq + Gemini); две **полосы** — основная (может быть платной) и бесплатная `LlmLane.FREE` для фоновой работы; распознавание речи (`transcribe`, multipart, свой лимит в аудиосекундах); без ключа — тихий `null` | — |
| `projects`, `social` | контент борда (проекты, соцссылки, артефакты) | `GET /api/projects`, `/api/social-links`, `/api/artifacts` |
| `theme` | волны: токены **и** layout-дельта в JSONB | `GET /api/theme/active`, `/api/themes` |
| `analytics` | cookieless-бикон + потайловая хитмапа (приватная сводка за bearer) | `POST /api/analytics/{beacon,interactions}` |
| `core` | bearer-фильтр `/api/ingest/*`, мягкий рейтлимит (два бакета на клиента: чтение и кадры дропа; SSR помечен `X-Danchuo-Internal` и не лимитируется), MSK/генезис-конфиг, кэш-шов | — |

`caddy/` — свой образ edge (stock caddy + `caddy-ratelimit` + `cache-handler`). Сам конфиг —
корневой `Caddyfile`: маршруты, потолки на клиента по зонам, десятисекундный кэш страницы и
`max_conns_per_host` к фронту. Числа там — из замеров прода, обоснование в комментариях и PRD §8.
Локального стека это не касается: в `docker-compose.yml` caddy нет, фронт слушает 3000 напрямую.
Проверять правки edge — отдельным контейнером поверх локальной сети (`--network danchuoworld_default`).

`frontend/` — Next.js (App Router) + TypeScript + Tailwind v4, публичный JSON-клиент
к Quarkus (только чтение).

- `src/lib/layout.ts` — реестр тайлов (`TileId`) и bento-раскладка; `resolveLayout(wave)`
  мержит дельту волны поверх дефолта. Новая волна = запись в БД, без правок кода (DESIGN §10.1).
- `src/components/*Tile.tsx` — по тайлу на виджет, каждый тянет свой источник сам
  (`useTileData`, per-tile состояния loading/empty/error/loaded); общий каркас — `TileShell`.
- Дневной и оконный слои — швы `useSelectedDay` / `useCalendarWindow` поверх общего
  `useDayRange`: пока едут новые данные, на экране остаются прежние (DESIGN §7 —
  лоадер уместен, только когда показать нечего).
- `src/app/admin/` — приватная админка (bearer в sessionStorage, noindex), разделы
  дропы · артефакты · велопоездки · статистика; следует волнам, как публичный борд.
- `e2e/` — Playwright, визуальная регрессия пер-тайл; эталоны снимаются **в Docker**
  (`npm run e2e:docker[:update]`), первый прогон с `--update-snapshots` показывает
  разошедшиеся снимки как failed — зелёным считается только повторный чистый прогон.
- Тесты — Vitest + React Testing Library (`*.test.ts(x)` рядом с кодом).

Подробная помодульная опись (как слои наполнялись по этапам M1–M5 / B1–B9) —
в приложении `docs/journal.md`.

## Версии стека (самые свежие, что тянем — см. память `latest-stack-preference`)
- **Java 25** нативно (toolchain + Gradle-демон через `org.gradle.java.home`); байткод-таргет 25 (Java и Kotlin консистентно).
- **Quarkus 3.31.2**, **Kotlin 2.3.20**, **Gradle 9.5.1** (wrapper).
- Миграции — **Liquibase** (а не Flyway): `quarkus-liquibase`, мастер `backend/src/main/resources/db/changelog/db.changelog-master.xml`, слайсы кладут чейнджлоги в `db/changelog/changes/`.

## Команды бэкенда (запускать из корня репо)
- Сборка без тестов: `./backend/gradlew -p backend build -x test`
- Dev-режим (hot reload, поднимает Postgres через Dev Services — **нужен Docker**): `./backend/gradlew -p backend quarkusDev`
- Тесты: `./backend/gradlew -p backend test` (требуют Docker для Dev Services Postgres)
- JDK для Gradle зашит в `backend/gradle.properties` (`D:/Programms/Java/jdk-25`); на другой машине — поправить путь.

## Команды фронта (запускать из `frontend/`)
- Установка: `npm ci` (или `npm install`)
- Dev-сервер: `npm run dev` (ожидает бэкенд на `NEXT_PUBLIC_API_BASE_URL`, дефолт `http://localhost:8080` — см. `.env.example`)
- Тесты: `npm run test` (Vitest); типы: `npm run typecheck`; прод-сборка: `npm run build`
  - Прогон идёт **двумя проектами** (`vitest.config.ts`): `logic` — чистые модули `src/lib/**`
    в окружении **node**, `dom` — всё остальное в jsdom. Гонять один: `npx vitest --project=logic`.
    Причина — замер: тесты логики исполняются 0.29с на 154 штуки, а jsdom под них стоил 35с
    подъёма. Разложение по каталогу, а не по расширению: вне `src/lib` всё как было.
  - Лог зелёного прогона — **точки** (`dot`) и без консоли прошедших тестов (`silent: "passed-only"`).
    У упавшего теста печатается всё: и диагностика, и его `console.log`. В CI (`process.env.CI`) —
    обычный поимённый список: там лог читают постфактум и переспросить не у кого.
- shadcn пока не подключён — добавим, когда понадобятся его компоненты.
- **Попробовать фото-дропы:** поднять бэк (`quarkusDev`) + фронт (`npm run dev`), открыть `/admin`, ввести bearer-токен (`danchuo.ingest.token`, в деве дефолт `dev-ingest-token-change-me`), загрузить zip с JPEG/PNG + название + дата → выбрать обложку кликом. Кадры лягут в `danchuo.film.storage-dir` (дефолт `backend/data/film`).

## Локальный стек — витрина проекта (**localhost:3000 всегда живой**)

Проект **постоянно крутится** на машине владельца в docker compose (корневой
`docker-compose.yml`): сайт `http://localhost:3000`, API `http://localhost:8080`,
postgres `localhost:5432`, WebDAV полки читалки `localhost:6065/dav`. Это **build-образы**, не dev-серверы: hot reload нет, правки кода
видны только после пересборки. Данные (тома `pgdata`, `filmdata`, `anxdata`) пересборку переживают.

- **Порт 8080 — стека, и ничей больше.** Не оставлять рядом `quarkusDev`: он садится на
  `127.0.0.1:8080`, контейнер публикует `0.0.0.0:8080`, и на петле выигрывает узкая привязка —
  `localhost:8080` начинает отвечать дев-джарником вместо стека, молча и надолго. Нужен
  hot reload — поднимать его на другом порту (`-Dquarkus.http.port=8082`).
- **В начале любой работы — идти в этот стек, а не поднимать ещё один сервер.** Посмотреть
  борд, снять скриншот, потыкать `/admin`, прогнать браузерную проверку — всё против
  `localhost:3000`. Свой `npm run dev` на свободном порту — крайняя мера (например,
  предпросмотр ещё не закоммиченной правки), и его надо гасить за собой.
- **Стек держим в актуальном состоянии.** В конце ветки — пересобрать и показать результат
  владельцу: `docker compose up -d --build frontend` (или `backend`, или без имени сервиса,
  если ветка тронула оба). Сборка фронта ~2–4 мин. Ветка считается доделанной, когда
  на `localhost:3000` крутится её код, а не предыдущий.
- **Порядок в конце ветки: сперва PR, финальная пересборка — последней.** Работа сделана ⇒
  открывай пул-реквест и только потом пересобирай стек: сборка идёт минуты, и держать
  готовый PR в заложниках у неё незачем. Пересборка **посреди** работы — другое дело: если
  надо что-то проверить на живом борде (скриншот, поведение, данные), пересобирай сколько
  нужно и PR не открывай — он открывается, когда открывать уже нечего.
- **Перед выводом «фикс не работает» по localhost** — проверить `docker compose ps` и дату
  образа: почти всегда там просто ещё старая сборка.
- Визуальная регрессия (`npm run e2e:docker`) бьёт в `host.docker.internal:3000`, то есть
  **в этот же стек** — эталоны имеют смысл только на свежепересобранном образе. Другой адрес
  — через `PW_BASE_URL`.

## Планируемая архитектура (big picture)

Расцепленный монолит, **не** микросервисы:
- **Бэкенд:** Quarkus (Kotlin), REST JSON API, PostgreSQL + Hibernate Panache, миграции **Liquibase** (заменили Flyway). Кэш — quarkus-cache (Caffeine, in-process; Redis сознательно не нужен в v1). Рейтлимит — собственный in-memory токен-бакет (`RateLimitFilter` в `core`) + L7 в Caddy.
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
- **Bento 20×14**, плитка «Сегодня» — доминанта; борд виден без скролла на ≥1440px. Per-tile состояния (loading/empty/error/loaded), общего спиннера нет. На тач-устройствах — одноколоночный стек; календарь в нём **тот же**, что в бенто (прежняя недельная полоса `WeekStrip` снята — она показывала одну неделю, то есть отвечала на другой вопрос; замер подтвердил, что 7 колонок влезают: на 360px ячейка ≈44px).

## Известные ограничения / решённые вопросы

- **Экранное время (Apple) программно недоступно.** Нет в HealthKit; Screen Time API (DeviceActivity) рендерит отчёт в песочнице-расширении и **не отдаёт сырые числа** наружу. Пока нет реального канала забрать данные с айфона — **не добавлять сущность/эндпоинт** под это (fallback — ручной ввод, поле `screenTimeMinutes` уже есть в DayRecord). См. PRD §9 (бэклог B2).
- Вуш/Юрент, прогресс книг, история подкастов — аналогично без публичного API → ручной ввод/research (PRD §9).

## Подводные камни инструментов

Вынесены в **[`docs/pitfalls.md`](docs/pitfalls.md)**: поведение инструментов, которое выглядит
поломкой кода — окружения Vitest, эталоны Playwright, комментарии Liquibase, общая БД в
`@QuarkusTest`, bind-маунты и теги образов на VPS, композитные слои WebKit. Спотыкнулся повторно
— дописывай туда, а не сюда.

## Рабочий процесс

- Изменения идут через **feature-ветку + PR**, не напрямую в `main` (см. память проекта).
- Коммиты: маркированный список изменений; крупные задачи разбивать; в сообщениях коммитов **не упоминать AI/ассистента** (см. память проекта).
- **Одна ветка = один коммит.** Вся работа фичи (бэкенд+инфра / фронт / доки) сводится в **единственный** коммит перед пушем/PR. Правки по ходу ревью не плодят коммиты — копятся и сквошатся в тот же один. При склейке слоёв **сохранять все буллеты** из объединяемых сообщений (конкатенация, ничего не терять). Сквош без интерактива: `git commit --fixup` + `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>`.
- **Версионирование.** В начале каждой новой ветки `feature/*` или `hotfix/*` инкрементить версию проекта первым коммитом ветки (semver). Пока бэк и фронт не разведены, версия одна. Когда у обоих появятся хотя бы еле рабочие версии — держать **две независимые версии** (отдельно фронт, отдельно бэк) и инкрементить ту часть, которой касается ветка (ветка, трогающая обе, — обе).
  - **Щедро используй патч-часть (последнюю цифру) для фиксов и мелких правок.** Крупная новая фича — minor; но косметика, полировка UI, поведенческие фиксы, доработки уже существующего — это **patch**, а не minor. Не гнать minor на каждую мелочь: сомневаешься между minor и patch → patch.
- **Ветка заканчивается пересборкой локального стека и показом результата** (см. раздел
  «Локальный стек — витрина проекта»): `docker compose up -d --build <frontend|backend>`,
  а затем скриншот/описание того, что изменилось на `localhost:3000`. Владелец смотрит
  результат там же, где живёт сайт, — не на временном сервере, который умрёт вместе с сессией.
- **Итог ветки — в PR и сообщении коммита, не в доках.** Хронику работы больше
  не ведём (`docs/journal.md` заморожен). Из ветки в доки едет только долгоживущее:
  правило — в PRD/DESIGN рядом с решением; всерьёз испробованная и отвергнутая
  альтернатива — там же строкой «рассмотрено и отклонено: X, потому что Y»;
  подводный камень инструмента — в раздел выше; состояние — в «Где мы сейчас» (перезаписью).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **danchuo.world** (6132 symbols, 13451 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
