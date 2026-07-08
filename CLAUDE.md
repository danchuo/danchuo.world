# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Текущее состояние репозитория

**Деплой-конвейер (выкатка M0) готов.** Схема PRD §8: **CI собирает, VPS только запускает.** `backend/Dockerfile.native` — GraalVM/Mandrel jdk-25 native-сборка Quarkus (добавлены расширения `quarkus-smallrye-health` — `/q/health/*` для смоука/деплой-гейта, и `quarkus-awt` — без него ImageIO фото-дропов не компилируется в натив; рантайм ubi9-minimal + freetype/fontconfig, JNI `.so` рядом с бинарём, `/data/film` заранее под uid 1001). `docker-compose.prod.yml` — **standalone** прод-стек (не override): caddy (единственный наружу, 80/443/h3) + frontend + backend(native) + postgres; секреты из `/opt/danchuoworld/.env` без дефолтов (`:?`); сосуществование с proxemics на том же VPS — loopback-порты 8081/5433 (8080/5432 заняты им), свой compose-проект. `Caddyfile`: `/api/*` → Quarkus напрямую (мимо Next — большие zip дропов), остальное → Next, `www` → apex, авто-TLS. `.github/workflows/deploy.yml`: push в `main` → native-бэк + Next-фронт → GHCR (теги `latest`+sha, sha = откат) → **смоук реально гоняет контейнеры**: health + загрузка zip через весь AWT-пайплайн (декод→ресайз→JPEG→диск→БД, ловит native-обрезания до прода) + чтение `/api/drops`+медиа + фронт SSR против бэка → scp compose+Caddyfile → ssh `pull && up -d` + health-гейт. Тесты гоняет `pr-build.yml` на PR (сделать required). Чеклист/секреты/DNS/откат — `docs/deploy.md`. **Миграции Liquibase консолидированы перед 1.0.0**: 21 файл → 12 (`0010`–`0120`), промежуточные апдейты (демо-«Ночь», зеркальные layout, AA-фикс, dropColumn, соц-апдейты) свёрнуты в финальные create+seed; итог сверен дампом байт-в-байт с базой по старой цепочке; ⚠️ номера миграций в исторических абзацах ниже — доконсолидационные. Версии: **бэк 1.0.0, фронт 1.0.0** (первый прод-релиз).

**Волна 02 «Obscura» + слой скинов волн готовы.** Введён **слой скинов волн**: ключ активной волны висит в `data-wave` на `<html>` (SSR + клиентский своп), под него в `globals.css` блоки `[data-wave="…"]` переопределяют **форму карт/фон/декор/шрифты** — не только цвет-токены (волна 01 не затронута; волна без блока берёт базовый скин). Демо-волна 02 переведена со «Ночи» на стиль **Obscura** (8-бит аркада на «облачной бумаге»): небесно-голубой холст `#e3f1fe`, белые **скруглённые «облачные» карты** вместо ступенчатой пиксель-рамки, мягкие сине-тонированные тени, единственный Signal Orange `#ff5e24`, графит-чернила. Типографика волны 02 — **Manrope** (UI) + **IBM Plex Mono** (данные) + пиксельный **Jersey 10** (`--font-display`) на бренде и имени дня (волна 01 — Inter + JetBrains). Декор: 3 пиксельных облака плывут слева направо за бордом (CSS-SVG, `z-index` за картами). Ховер — оранжевое кольцо-«подсветка выбора»; метки тайлов в скине скрыты; своя раскладка «аркадный автомат». Полный токен-набор + раскладка — миграция `0200` (поверх соц-миграции `0190`); волна остаётся **неактивной** (через переключатель). Доки: PRD §5.9 «волна = три слоя (токены/раскладка/скин)», DESIGN §10 (скин) + §10.2 (каталог волн, без сравнений). Фикс: мини-карта поездки изолирована (`isolation:isolate`) — её z-index больше не наслаивается поверх модалок. Версии: бэк 0.12.0, фронт 0.14.0. ⚠️ Эталоны Playwright волны 02 при необходимости переснять в Docker.

**B4 (история поездок Велобайк) готова.** Поверх B2: новый изолированный слайс `bike` (внешний источник целиком в своём пакете, как `spotify`, ядро не тронуто). Сущность `Ride` (идемпотентность по `externalId` аренды), `BikeRideService` (upsert + агрегат), публичные `GET /api/rides` и `GET /api/rides/stats`, приватный ingest (push `POST /api/ingest/bike/rides` + SMS-логин/поллер за Qrator). Внешний контур: `VelobikeClient` (REST к `pwa.velobike.ru`), `VelobikeTokenService` (SMS→JWT, refresh шифрованно at-rest как Spotify), `VelobikePoller` (`@Scheduled`, выкл по умолчанию — API за Qrator), конфиг `danchuo.bike.*`, добавлен `quarkus-scheduler`. Маппинг `RentItem→Ride` покрыт юнит-тестом на анонимизированной фикстуре. Миграции `0170` (bike_ride + velobike_token) и `0180` (переработка layout волны 02 «Ночь» — зеркальная перекомпоновка + ride). Фронт: `RideTile` (вертикальный — мини-карта последней поездки + км/мин/ккал + относительное «когда», «предыдущие» → модалка `RidesModal`), `RideMap` (Leaflet, client-only, карта CARTO Voyager, старт/финиш + пологая пунктирная дуга A→B; трека нет — честно две точки). Реестр тайлов дополнен `ride` (высокий слева-снизу), статы подняты, hero ужат. Версии: бэк 0.10.0, фронт 0.12.0. ⚠️ Эталоны Playwright пересняты в Docker. Детали — слайс `bike`, фронт-раздел ниже; функционал — PRD §5.13, визуал — DESIGN §7.6.

**B2 (хитмапа кликов) готова.** Поверх B1: расширение слайса `analytics` — потайловая хитмапа. Бикон копит клики по тайлам борда (`[data-tile-id]`) с долей **внутри** тайла (0..1, не экранные px — стабильно через вьюпорты/волны) и шлёт батчем на уходе (`navigator.sendBeacon`) на публичный `POST /api/analytics/interactions`. Сущность `InteractionEvent` (сестра `AnalyticsEvent`, тот же cookieless-контур), `InteractionService` (батч-запись с валидацией + потайловый агрегат с **cap-вклада** одного посетителя). Приватный просмотр — секция хитмапы внизу `/admin` (тот же bearer, noindex): рисует bento борда, заливая тайлы интенсивностью кликов + таблица. Анти-накрутка эшелонирована (рейтлимит `RateLimitFilter` теперь покрывает и `POST /api/analytics/*` + валидация на записи + cap на чтении). Детали — слайс `analytics`, фронт `AnalyticsBeacon`/`HeatmapSection`. E2E-визуал не затронут (`data-tile-id` не меняет рендер).

**B1 (загрузка фото-дропов) готова.** Поверх M5: реальная загрузка фото-дропов через `/admin` — zip за дроп (~36 кадров), ресайз web+thumb с EXIF-поворотом (JDK ImageIO + metadata-extractor), байты за интерфейсом `PhotoStorage` (сейчас локальный диск, далее S3/R2), выбор обложки кликом. Два тайла: крупный «последний дроп» (5 случайных кадров) + компактная «лента дропов» (все дропы, клик → модалка; отдельной страницы-архива нет). Детали — в слайсе `film` и фронт-разделе ниже. ⚠️ Тайл фото-дропов изменился — Playwright-эталоны переснять в Docker (`npm run e2e:docker:update`).

**Эра M5 (полировка/адаптив/релиз-готовность) готова.** Поверх M4: индикатор свежести данных (singleton `lastIngestAt`), доступность (фокус-видимость, тач-таргеты, AA-контраст), SEO/OG/favicon/robots/sitemap, прогон пустых состояний и визуальная регрессия Playwright пер-тайл (эталоны в Docker). Остаётся только **выкатка** в прод (деплой-конвейер M0) — делается отдельным заходом.

**Эра M4 (статика/темы/аналитика) готова.** Бэкенд: спина данных M1 + read-API дня/календаря (M2) + слайс `spotify` (M3) + контент-слайсы `projects`/`social`, система тем `theme` (токены **и layout-per-wave** в JSONB → инжект в `:root` / раскладка борда), приватная аналитика `analytics` (cookieless бикон), каркас фото-дропов `film` + мягкий рейтлимит публичных GET. Фронт: борд наполнен живыми тайлами (проекты, соцссылки, marquee артефактов, hero, фото-дропы + модалка, переключатель волн), SSR-инжект токенов **и раскладки** активной волны, JS-бикон аналитики.

- `docs/PRD-danchuoworld.md` — **что** строим: функциональные требования, acceptance criteria, модель данных, этапы M0–M5 + бэклог.
- `docs/DESIGN.md` — **как** это выглядит и ощущается: источник правды по дизайну (волна 01, токены, bento-сетка, состояния).
- `backend/` — Quarkus (Kotlin), Gradle. Feature-пакеты (вертикальные слайсы, PRD §3.1) + `core` (сквозные соглашения).
  - **M1 наполнены:** `days` (`DayRecord` + `DayRecordService` — единая точка записи дня, генезис-гард), `health` (`Workout`, `POST /api/ingest/health`), `checklist` (`ChecklistItem`/`ChecklistEntry`, `POST /api/ingest/daily`, пункт `monster` — производная от вкуса), `monster` (`MonsterFlavor`, data-driven вкусы). Сиды пунктов и вкусов — в Liquibase. Ingest идемпотентен (upsert по дате), null ≠ 0 (§5.4).
  - **M2 (бэкенд) готов:** `days` дополнен агрегатором (`DayAggregator`) и публичными `GET /api/days/{date}` (полная проекция `DayView`) + `GET /api/days?from=&to=` (сводки `DaySummary` для календаря/мини-графика). Все GET публичны, генезис-гард, null ≠ 0.
  - **M3 (бэкенд) готов:** слайс `spotify` — внешний источник целиком в своём пакете, ядро не тронуто. `SpotifyConfig` (креды/скоупы/ключ из env), `SpotifyToken` + `SpotifyCrypto` (refresh-токен шифрованно at-rest, AES-GCM), `SpotifyTokenService` (one-time обмен кода + прозрачный рефреш access-токена), `SpotifyAuthResource` (`GET /api/ingest/spotify/authorize` за bearer + публичный `GET /api/spotify/callback` со сверкой `state`), REST-клиенты к Spotify + `SpotifyService` с Caffeine-кэшем (now-playing ~20с, recent/top — минуты), публичные `GET /api/spotify/{now-playing,recent,top}`. Не сконфигурирован/не подключён ⇒ пустая форма (200), не падение.
  - **M4 (бэкенд) готов:** контент-слайсы `projects` (`GET /api/projects`) и `social` (`SocialLink`+`Artifact`, `GET /api/social-links`/`/api/artifacts`); `theme` — волны с токенами **и опциональным layout-блоком** в JSONB (`Theme`, `@JdbcTypeCode(JSON)`; `LayoutSpec` — переопределение спанов/видимости/грида/мобильного порядка, бэкенд хранит как непрозрачный JSON), `GET /api/theme/active` (кэш, отдаёт `tokens`+`layout`) + `GET /api/themes`, сид волны 01 = весь токен-набор из `globals.css` (layout=null ⇒ дефолт фронта) + демо-«Волна 02» с layout-дельтой; `analytics` — cookieless-телеметрия (сырой IP не хранится, только суточный хэш `VisitorHash`), публичный `POST /api/analytics/beacon` + фильтр ботов `BotHeuristics` + приватная сводка `GET /api/ingest/analytics/summary` (за bearer); `film` — фото-дропы (см. B1 ниже). Артефакты могут быть без картинки (`Artifact.imageUrl` nullable — marquee рисует пиксель-плейсхолдер). Сиды/схема — Liquibase `0060`–`0120`.
  - **M5 (бэкенд) готов:** свежесть данных — singleton `IngestStatus.lastIngestAt`, пишется из единой точки приёма (`DayRecordService.upsert`, оба канала ingest), публичный `GET /api/freshness`. Миграции `0130` (ingest-status) и `0140` (AA-контраст токена `text-tertiary` волны 01 — UPDATE, не правка применённого `0080`).
  - **B1 (бэкенд) готов — слайс `film`:** загрузка фото-дропов. `PhotoStorage` (интерфейс) + `LocalDiskPhotoStorage` (локальный диск, ключ кадра `"{dropId}/{sortOrder}"`, web+thumb; подменяется на S3/R2 без правок слайса); `FilmImaging` (распаковка не тут — ресайз web/thumb через JDK ImageIO + EXIF-поворот через metadata-extractor; неподдерживаемый формат ⇒ пропуск); `FilmService` (транзакционная оркестрация: распаковка zip → обработка → хранилище → БД, выбор обложки, удаление, проекции). Ресурсы: публичные `FilmResource` (`GET /api/drops`, `/api/drops/{id}` — теперь web+thumb URL) и `FilmMediaResource` (`GET /api/film-media/{dropId}/{seq}/{variant}` — раздача с диска, исключена из рейтлимита); приватный `FilmAdminResource` (`POST /api/ingest/drops` multipart zip+title+date, `GET /api/ingest/drops`, `GET …/{id}/photos`, `PUT …/{id}/cover`, `DELETE …/{id}`). `FilmPhoto.imageUrl` снят (миграция `0150` — `dropColumn`), URL-ы генерятся из ключа. Конфиг `danchuo.film.*` (каталог/размеры/качество), лимит тела поднят (`quarkus.http.limits.max-body-size`).
  - **B2 (бэкенд) готов — хитмапа в слайсе `analytics`:** `InteractionEvent` (потайловые клики: `tileId` + доли `offsetX/YPct` внутри тайла + `viewportW`; сырой IP не хранится, суточный хэш как у `AnalyticsEvent`), `InteractionService` (батч-запись с поэлементной валидацией: потолок батча, длина `tileId`, координаты [0,1] + потайловый агрегат с cap-вклада посетителя), публичный `InteractionResource` (`POST /api/analytics/interactions`, вне `ingest`) и приватная хитмапа `GET /api/ingest/analytics/heatmap` (в `AnalyticsSummaryResource`, за bearer). Конфиг `danchuo.analytics.heatmap.{max-batch,visitor-cap}`. Миграция `0160`. `RateLimitFilter` расширен на `POST /api/analytics/*` (анти-накрутка).
  - **B4 (бэкенд) готов — слайс `bike`:** история поездок Велобайка, внешний источник изолирован в пакете (как `spotify`). `Ride` (идемпотентность по `externalId` аренды), `BikeRideService` (upsert + агрегат), публичные `GET /api/rides` и `GET /api/rides/stats`, приватный ingest: push `POST /api/ingest/bike/rides` + SMS-логин/поллер за Qrator. Внешний контур: `VelobikeClient` (REST к `pwa.velobike.ru`), `VelobikeTokenService` (SMS→JWT, refresh шифрованно at-rest как Spotify через AES-GCM), `VelobikePoller` (`@Scheduled`, **выкл по умолчанию** — API за Qrator), конфиг `danchuo.bike.*`, добавлен `quarkus-scheduler`. Маппинг `RentItem→Ride` — юнит-тест на анонимизированной фикстуре. Миграции `0170` (bike_ride + velobike_token) и `0180` (layout волны 02 «Ночь»).
  - `core` содержит bearer-фильтр (`/api/ingest/*`), мягкий рейтлимит публичных GET **и публичной телеметрии `POST /api/analytics/*`** (`RateLimitFilter`, in-memory токен-бакет по IP; `/api/film-media` исключён), MSK/генезис-конфиг и кэш-шов.
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind v4. Публичный JSON-клиент к Quarkus (только чтение).
  - **M2 каркас:** токены волны 01 в `:root` (`src/app/globals.css` — теперь **дефолт-фолбэк**, поверх которого M4 инжектит токены из БД), data-driven layout-конфиг тайлов (`src/lib/layout.ts`, bento 20×14), плитка «Сегодня»/календарь/статы + недельная полоса на мобиле, per-tile состояния (loading/empty/error/loaded).
  - **M3:** `MusicTile` (`src/components/MusicTile.tsx`) — живой слой Spotify; тянет `/api/spotify/now-playing` (опрос на интервале) + `/api/spotify/recent` сам, независимо от выбранного дня. Пусто ⇒ «ничего не играет».
  - **M4:** контентные тайлы (`ProjectsTile`/`SocialTile`/`ArtifactMarquee`/`HeroTile`/`PhotoDropsTile`+`PhotoDropModal`) — каждый тянет свой источник сам (общий шов `useTileData`, per-tile состояния); `SocialTile` — бегущая строка (как `ArtifactMarquee`), спрайт-иконки `/assets/social/*.svg` красятся токеном `--text-primary` через CSS-маску (следуют за волной); сиды соцссылок и SVG-спрайты — миграция `0190` + `frontend/public/assets/social/`; `WaveSwitcher` — клиентский своп волны через контекст `WaveProvider` (токены в `:root` + раскладка борда); SSR-инжект токенов **и layout** активной волны (`layout.tsx` токены в `<head>`, `page.tsx` → `WaveProvider`, без вспышки, фолбэк на `globals.css`/`layout.ts`); `AnalyticsBeacon` — cookieless JS-бикон (load + dwell на уходе).
  - **M5:** `FreshnessTile` (тихий индикатор свежести, `GET /api/freshness`, `formatAgo` «N назад»); доступность — `:focus-visible`-аутлайн, тач-таргеты ≥44px на coarse-указателях, AA-контраст `--text-tertiary` (`#756a61`); SEO — OG/twitter/canonical + `robots.ts`/`sitemap.ts`/`icon.svg`/генерируемая `opengraph-image` (`SITE_URL` env); визуальная регрессия Playwright **пер-тайл** (`e2e/`: детерминизм стабом `/api/*` + фикс-часов, эталоны снимаются в Docker — `npm run e2e:docker[:update]`).
  - **B1:** два тайла фото-дропов. `LatestDropTile` (`latestDrop`) — последний дроп **justified-мозаикой**: **5 случайных** кадров (`pickRandom`, перетасовка на каждом маунте) пакуются в ряды по реальным `width/height` (мерим тайл `ResizeObserver`, число рядов выбираем по близости высоты раскладки к высоте тайла, масштаб ≤1) — без обрезки/искажения, влезая в плитку; клик → модалка. `PhotoDropsTile` (`photoDrops`, узкая колонка col10-12 row11-15 — сразу после музыки/статов, в 1 клетке слева от «Сегодня») — **вертикальная** лента **всех** дропов, клик → модалка (отдельной страницы-архива нет: лента и есть архив). «Сегодня» смещён на ряд вниз (row6), latestDrop растянут на ряд вниз (rowSpan4) под него; `Board`/e2e-список тайлов обновлены. **`/admin`** (`app/admin/page.tsx` + `layout.tsx` noindex) — ввод bearer (sessionStorage), загрузка zip (title+date) с **таймером секунд** (не прогресс-бар: через прокс­и/локально аплоад мгновенен, а время уходит на ресайз), клик-выбор обложки, удаление; админ-клиент `lib/api/admin.ts`, `lib/api/media.ts` (`mediaUrl`). E2E-фикстуры стабят `/api/film-media` 1×1-пикселем (снимок детерминирован при случайной выборке).
  - **B2 (фронт):** `AnalyticsBeacon` расширен сбором кликов — глобальный capture-listener ищет ближайший `[data-tile-id]`, считает долю точки внутри его `getBoundingClientRect` (0..1), копит в буфер (потолок 50) и шлёт **батчем на уходе** (`postInteractions` → `sendBeacon`). `Board` навесил `data-tile-id` на обёртки тайлов (bento + стек) — рендер не изменён. Приватный просмотр — секция `app/admin/HeatmapSection.tsx` внизу единой скроллящейся `/admin` (noindex, токен приходит пропом после логина): рисует bento по `resolveLayout(null)`, заливая тайлы `color-mix` по доле кликов + таблица; админ-клиент `getHeatmap`. Админка — фиксированный чёрно-белый скин `admin.css` (`.admin-root` затеняет токены волн; волнам не следует). По умолчанию окно — **последние 7 дней** (дефолт в `AnalyticsSummaryResource`); `path` зашит в `/` (поле не выносим — публичная страница одна, `path`/период остаются в API). Бикон **не трекает `/admin*`** (клики владельца не мусорят аналитику).
  - **B4 (фронт):** виджет поездок Велобайка. `RideTile` (вертикальный, высокий слева-снизу) — мини-карта последней поездки + цифры (км/мин/ккал в один ряд) + относительное «когда»; «предыдущие» по правому краю → модалка `RidesModal` (контур как у фото-дропов: окно сверху на весь экран, Esc/фокус-трап/блок скролла). `RideMap` (Leaflet, **client-only**) — базовая карта CARTO Voyager, старт/финиш кружками, связь — пологая пунктирная **дуга** (не прямая/не петли: трека нет, честно «A→B»). Реестр тайлов дополнен `ride`, статы подняты, hero ужат до малого блока; типы/клиент `getRides`/`getRideStats`, форматтеры `rideFormat` (+тест). E2E: стаб `/api/rides` без координат (без внешних тайлов карты), тайл `ride` в спеке, эталоны (desktop+mobile) пересняты в Docker. Зависимость `leaflet`.
  - **Большие zip:** Next-прокси режет проксируемое тело (дефолт 10MB) — поднят `experimental.middlewareClientMaxBodySize` в `next.config.ts` (в проде /api проксирует Caddy, лимита нет). Бэкенд: обработка кадров вынесена из БД-транзакции (иначе таймаут менеджера на сотнях МБ), лимит тела `quarkus.http.limits.max-body-size`.
  - **Layout-per-wave (`src/lib/layout.ts`):** `TileSpan.hidden` + `TileSpan.orientation` (`horizontal|vertical` — поток контента тайла; уважает пока только `marquee`, вертикаль = бесшовная петля по Y в `common.css`, битые значения отбрасываются) + `resolveLayout(wave)` — мерж layout-блока волны **поверх** дефолта `TILE_LAYOUT` (волна задаёт дельту: переставить/ресайзить/спрятать/развернуть тайлы, грид, мобильный порядок). Раскладка волны 02 — миграция `0210`: вертикальная лента артефактов у левого края на всю высоту, контент в три колонки, `music` укрупнена, `photoDrops`|`ride` — узкие вертикальные бок о бок. Реестр тайлов (`TileId`) за кодом; неизвестные коду тайлы игнорируются; `waveSwitcher` спрятать нельзя; `null` ⇒ чистый дефолт. `Board` рендерит из `useWave().layout`. Добавление волны = запись в БД с опц. `layout`-JSON, без правок кода. См. DESIGN §10.1.
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
- **Попробовать фото-дропы:** поднять бэк (`quarkusDev`) + фронт (`npm run dev`), открыть `/admin`, ввести bearer-токен (`danchuo.ingest.token`, в деве дефолт `dev-ingest-token-change-me`), загрузить zip с JPEG/PNG + название + дата → выбрать обложку кликом. Кадры лягут в `danchuo.film.storage-dir` (дефолт `backend/data/film`).

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
- **Одна ветка = один коммит.** Вся работа фичи (бэкенд+инфра / фронт / доки) сводится в **единственный** коммит перед пушем/PR. Правки по ходу ревью не плодят коммиты — копятся и сквошатся в тот же один. При склейке слоёв **сохранять все буллеты** из объединяемых сообщений (конкатенация, ничего не терять). Сквош без интерактива: `git commit --fixup` + `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>`.
- **Версионирование.** В начале каждой новой ветки `feature/*` или `hotfix/*` инкрементить версию проекта первым коммитом ветки (feature → minor, hotfix → patch; semver). Пока бэк и фронт не разведены, версия одна. Когда у обоих появятся хотя бы еле рабочие версии — держать **две независимые версии** (отдельно фронт, отдельно бэк) и инкрементить ту часть, которой касается ветка (ветка, трогающая обе, — обе).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **danchuo.world** (2432 symbols, 4891 relationships, 177 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
