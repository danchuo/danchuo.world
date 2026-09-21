# CLAUDE.md

Working instructions for Claude Code in this repository: conventions, commands, a map of the code.
Only **long-lived** things live here — structure, rules, commands. **No branch chronicle and no
"where we are now":** what a branch did belongs in its PR and commit message, a rule belongs in
PRD/DESIGN beside its feature, versions live in `frontend/package.json` and
`backend/build.gradle.kts`, and the first year's archive is `docs/journal.md`.

## Documents — who answers for what

PRD (`docs/PRD-danchuoworld.md`) and DESIGN (`docs/DESIGN.md`) are separate sources of truth; do
not duplicate between them:
- **PRD** = functionality and acceptance criteria. Visuals are described neutrally ("in the active wave's style"), never tied to a particular wave.
- **DESIGN** = the visual specification. The decor layer and the specifics of individual waves are
  discussed only here; the catalogue of waves (how each is dressed, which is active) is DESIGN §10.2.
- For a change touching both planes, edit both and keep them consistent (see the project memory on PRD/DESIGN sync).
- **`docs/journal.md`** = the **archive** of the first year's branch chronicle (frozen, not extended).
  Its value is in rejected alternatives, measurements and dissected breakages, which exist neither in
  the code nor in PRD/DESIGN. Before redoing something that looks strange, grep here: that path may
  already have been walked and rolled back.
- `docs/deploy.md` — rollout checklist, secrets, rollback.
- `docs/pitfalls.md` — tool pitfalls: symptoms that look like broken code but are a property of a
  tool. A diagnostic list, not project rules.
- `docs/artifact-detection-notes.md` — working log of artifact detection on frames.

**Language.** Russian is the language the project is *talked about* in: documents in `docs/` (and
this file's Russian counterparts in PRD/DESIGN), **commit messages and PR descriptions**. English is
the language the project is *written* in: code comments, config files, build and deploy files,
workflows, tests. The line falls between prose aimed at the owner and text living inside the code.

## Repository map

`backend/` — Quarkus (Kotlin), Gradle. Vertical slices (PRD §3.1) plus `core`. A slice keeps its
external source entirely to itself; the core knows nothing about it.

| slice | about | public endpoints |
|---|---|---|
| `days` | the day's core: `DayRecord`, `DayRecordService` (single write point, genesis guard), `DayAggregator`, freshness | `GET /api/days/{date}`, `GET /api/days?from=&to=`, `GET /api/freshness` |
| `health` | ingest from the iOS shortcut: steps, sleep sessionisation (`SleepSessionizer`), journal (`JournalDetector`) | `POST /api/ingest/health` |
| `checklist` | discipline items and their marks; the monster is a boolean fact marked through the `monster` item (ingest treats any non-empty value as drunk) | `POST /api/ingest/daily` |
| `spotify` | OAuth, refresh encrypted at rest, Caffeine cache; podcast poller (`@Scheduled` 60s → `podcast_session`, the `podcasts` item derived from minutes; a session also remembers the CHUNK of an episode: `start_progress_ms`→`last_progress_ms`); `PodcastSummarySource` — the text of what was heard: Apple catalogue → RSS → audio windows by `Range` → transcription | `GET /api/spotify/{now-playing,recent,top}` |
| `github` | contributions from the profile's HTML fragment, `@Scheduled`; does not move the freshness lamp | travel in `DaySummary` |
| `reading` | the Anx Reader shelf over WebDAV: the reader's SQLite → reading sessions (`@Scheduled` 5m → `reading_session`, the `reading` item derived from minutes); `ReadingSummarySource` — where the text of what was read comes from (an epub on the shelf) | `GET /api/reading/cover/{id}` |
| `summary` | retelling the chunk covered in a sitting, **shared across sources**: queue and attempts (`content_summary`, keyed by `kind`+`sessionId`), pure `SummaryPolicy`/`SummaryWindows`, a prompt with a per-kind vocabulary, one `SummaryPoller` (`@Scheduled` 2m, the LLM's free lane) for all of them. Slices supply text through `SummarySource` | `GET /api/summary/{kind}/{id}` |
| `bike` | Velobike: rides, tariff purchases, station geocoding (Nominatim) | `GET /api/rides`, `/api/rides/stats`, `/api/rides/month-summary` |
| `film` | photo drops: zip → web+thumb, frame rotation through an LLM, artifact detection | `GET /api/drops`, `/api/film-media/…` |
| `llm` | a client for external LLMs behind `LlmClient` (Groq + Gemini); two **lanes** — the main one (which may be paid) and the free `LlmLane.FREE` for background work; speech recognition (`transcribe`, multipart, its own limit in audio-seconds); with no key, a quiet `null` | — |
| `projects`, `social` | board content (projects, social links, artifacts) | `GET /api/projects`, `/api/social-links`, `/api/artifacts` |
| `analytics` | a cookieless beacon plus a per-tile heatmap (private summary behind a bearer) | `POST /api/analytics/{beacon,interactions}` |
| `feedback` | a visitor's note to the author: three optional answers behind one public POST, read and deleted only by the owner; rules live in the pure `FeedbackPolicy` | `POST /api/feedback` |
| `core` | bearer filter on `/api/ingest/*`, a soft rate limit (three buckets per client: reads, drop frames and notes; SSR is marked `X-Danchuo-Internal` and is not limited), the visitor primitives every public endpoint shares (`VisitorHash`, `BotHeuristics`), MSK and genesis config, the cache seam | — |

`caddy/` — our own edge image (stock caddy plus `caddy-ratelimit` and `cache-handler`). The config
itself is the root `Caddyfile`: routes, per-client ceilings by zone, security headers (a strict CSP
on `/api/*`, the rest site-wide), a ten-second page cache and `max_conns_per_host` to the frontend. Its numbers come from production measurements, with the
reasoning in the comments and PRD §8. None of this touches the local stack: `docker-compose.yml`
has no caddy and the frontend listens on 3000 directly. Edge changes are checked with a separate
container over the local network (`--network danchuoworld_default`).

`frontend/` — Next.js (App Router) + TypeScript + Tailwind v4, a public JSON client to Quarkus
(read-only).

- `src/lib/layout.ts` — the tile registry (`TileId`) and the bento layout; `resolveLayout(wave)`
  merges a wave's delta over the default.
- `src/lib/waves/` — the waves themselves: a file per wave (palette + layout delta) beside its skin
  in `app/styles/waves/`, plus the registry and the active key. They used to be database rows; why
  they are code now is PRD §5.9 / DESIGN §10.1. `index.test.ts` checks every wave's board for
  overlaps and grid overflow.
- `src/components/*Tile.tsx` — one tile per widget, each fetching its own source
  (`useTileData`, per-tile loading/empty/error/loaded states); the shared shell is `TileShell`.
- The day and window layers are the `useSelectedDay` / `useCalendarWindow` seams over a shared
  `useDayRange`: while new data travels, the previous data stays on screen (DESIGN §7 — a loader is
  right only when there is nothing to show).
- `src/app/admin/` — the private admin (bearer in sessionStorage, noindex), with sections for drops,
  artifacts, rides, statistics and visitor feedback; it follows waves like the public board.
- `e2e/` — Playwright, per-tile visual regression; baselines are taken **in Docker**
  (`npm run e2e:docker[:update]`), and a first run with `--update-snapshots` reports diverged
  snapshots as failed — only a second, clean run counts as green.
- Tests are Vitest + React Testing Library (`*.test.ts(x)` beside the code).

A detailed per-module inventory (how the layers were filled in over stages M1–M5 / B1–B9) is in the
appendix of `docs/journal.md`.

## Stack versions (the freshest we can take — see the `latest-stack-preference` memory)
- **Java 25** natively (toolchain plus the Gradle daemon through `org.gradle.java.home`); bytecode target 25, consistently for Java and Kotlin.
- **Quarkus 3.31.2**, **Kotlin 2.3.20**, **Gradle 9.5.1** (wrapper).
- Migrations are **Liquibase** rather than Flyway: `quarkus-liquibase`, master at `backend/src/main/resources/db/changelog/db.changelog-master.xml`, and slices put their changelogs in `db/changelog/changes/`.

## Backend commands (run from the repository root)
- Build without tests: `./backend/gradlew -p backend build -x test`
- Dev mode (hot reload, raises Postgres through Dev Services — **Docker required**): `./backend/gradlew -p backend quarkusDev`
- Tests: `./backend/gradlew -p backend test` (they need Docker for the Dev Services Postgres)
- The JDK for Gradle is pinned in `backend/gradle.properties` (`D:/Programms/Java/jdk-25`); on another machine, fix the path.

## Frontend commands (run from `frontend/`)
- Install: `npm ci` (or `npm install`)
- Dev server: `npm run dev` (expects the backend at `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:8080` — see `.env.example`)
- Tests: `npm run test` (Vitest); types: `npm run typecheck`; production build: `npm run build`
  - The run goes as **two projects** (`vitest.config.ts`): `logic` — the pure modules of `src/lib/**`
    in the **node** environment — and `dom` — everything else in jsdom. To run one:
    `npx vitest --project=logic`. The reason is a measurement: logic tests execute in 0.29s for 154
    of them, while raising jsdom under them cost 35s. The split is by directory, not by extension:
    outside `src/lib` everything is as it was.
  - A green run's log is **dots** (`dot`), with no console output from passing tests
    (`silent: "passed-only"`). A failing test prints everything, diagnostics and its `console.log`
    alike. In CI (`process.env.CI`) the usual by-name list is used: there the log is read after the
    fact, with nobody to ask.
- shadcn is not wired in yet — we will add it when its components are needed.
- **To try photo drops:** raise the backend (`quarkusDev`) and the frontend (`npm run dev`), open `/admin`, enter the bearer token (`danchuo.ingest.token`, defaulting to `dev-ingest-token-change-me` in dev), upload a zip of JPEG/PNG plus a title and a date, then pick a cover by clicking. Frames land in `danchuo.film.storage-dir` (default `backend/data/film`).

## The local stack is the project's shop window (**localhost:3000 is always live**)

The project **runs continuously** on the owner's machine in docker compose (the root
`docker-compose.yml`): the site at `http://localhost:3000`, the API at `http://localhost:8080`,
postgres at `localhost:5432`, the reader's WebDAV shelf at `localhost:6065/dav`. These are **build
images**, not dev servers: there is no hot reload, and code changes show only after a rebuild. Data
(the `pgdata`, `filmdata` and `anxdata` volumes) survives a rebuild.

- **Port 8080 belongs to the stack and to nobody else.** Do not leave `quarkusDev` running beside it:
  it binds `127.0.0.1:8080` while the container publishes `0.0.0.0:8080`, and on loopback the
  narrower binding wins — `localhost:8080` starts answering from the dev jar instead of the stack,
  silently and for a long time. If hot reload is needed, raise it on another port
  (`-Dquarkus.http.port=8082`).
- **At the start of any work, go to this stack rather than raising another server.** Looking at the
  board, taking a screenshot, poking `/admin`, running a browser check — all of it against
  `localhost:3000`. A private `npm run dev` on a free port is a last resort (previewing an uncommitted
  change, say), and it has to be shut down afterwards.
- **Keep the stack current.** At the end of a branch, rebuild and show the owner the result:
  `docker compose up -d --build frontend` (or `backend`, or no service name if the branch touched
  both). A frontend build takes ~2–4 min. A branch counts as finished when `localhost:3000` is
  running its code rather than the previous one.
- **Order at the end of a branch: the PR first, the final rebuild last.** The work is done ⇒ open the
  pull request and only then rebuild the stack: a build takes minutes, and there is no reason to hold
  a ready PR hostage to it. A rebuild **mid-work** is a different matter: if something has to be
  checked on the live board (a screenshot, behaviour, data), rebuild as often as needed and do not
  open the PR — it opens when there is nothing left to open.
- **Before concluding "the fix does not work" from localhost** — check `docker compose ps` and the
  image date: almost always it is simply still the old build.
- Visual regression (`npm run e2e:docker`) hits `host.docker.internal:3000`, that is **this same
  stack** — baselines only mean anything on a freshly rebuilt image. Another address goes through
  `PW_BASE_URL`.

## Architecture (big picture)

A decoupled monolith, **not** microservices:
- **Backend:** Quarkus (Kotlin), REST JSON API, PostgreSQL + Hibernate Panache, migrations by **Liquibase** (which replaced Flyway). The cache is quarkus-cache (Caffeine, in-process; Redis is deliberately unnecessary in v1). The rate limit is our own in-memory token bucket (`RateLimitFilter` in `core`) plus L7 in Caddy.
- **Frontend:** Next.js App Router, isolated into a JSON client to Quarkus.
- **Deploy:** Docker Compose (app + postgres + caddy), GitHub Actions → GHCR → ssh to the VPS. Caddy is TLS, reverse proxy and serving of Next.js statics.

### Cross-cutting conventions (easy to break; read before editing data)

- **The canonical timezone is MSK (UTC+3).** All "days", day boundaries (MSK midnight) and aggregates are computed in MSK regardless of the server's or visitor's timezone. The data axis is a `LocalDate` in MSK.
- **Sleep belongs to the day of waking.** Day D's `sleepMinutes` is the sleep session that ended by waking on day D.
- **The genesis date** in the config is where data starts; before it there is nothing. Future days render empty.
- **All data is public to read.** What is protected is not the content but the **write credentials**: mutating endpoints (`/api/ingest/*`) sit behind a static bearer token in `Authorization`, while every GET is public. Ingest is idempotent (upsert by date).
- **Data from the phone is pushed, not pulled.** iOS shortcuts post to ingest (Health automatically at 12/18/24 MSK; checklist, monster and day name through an interactive shortcut). Apple has no cloud API.
- **Spotify** is polled live; the refresh token is encrypted at rest; the Caffeine cache absorbs the load (now-playing TTL ~20s).

### Design architecture (DESIGN.md is the truth)

- **Zero hardcoded colours or sizes in components.** Every visual value is a design token (a CSS variable) declared in the wave's file and injected into `:root` by SSR.
- **The "wave" system:** a wave is a named visual style (palette, typography, decor layer, layout spans), swapped between releases. Changing the active wave changes the whole site with no component edits, and a wave may override the spans of bento tiles.
- **The backend knows nothing about waves.** They travel with the frontend, so SSR makes no backend call to render the board.
- **A wave's decor sits ON TOP of a clean AA base,** whatever the wave: it lives in borders, icons,
  accents, loaders and the calendar, and **never** in body text, data figures or navigation. When in
  doubt: clarity > craft.
- **A wave's skin overrides parameters rather than cancelling the base's rules.** Tile edge, hover
  gesture, ground and the sizes of inner cards all arrive as tokens or variables — a wave may take
  the default, override it or decline, without touching a neighbouring wave's rule. Which wave is
  active and how it is dressed lives **only** in DESIGN §10.2, not here.
- **Bento 20×14**, with the "Today" tile as the dominant; the board is visible without scrolling at ≥1440px. Per-tile states (loading/empty/error/loaded), with no shared spinner. On touch devices it becomes a single-column stack, and the calendar in it is **the same one** as in bento (the former `WeekStrip` was removed — it showed one week, i.e. answered a different question; a measurement confirmed that 7 columns fit, a cell being ≈44px at 360px).

## Known limits / settled questions

- **Screen time (Apple) is not available programmatically.** It is not in HealthKit, and the Screen Time API (DeviceActivity) renders its report inside a sandboxed extension and **does not hand out raw numbers**. Until there is a real channel for taking the data off the iPhone, **do not create an entity, an endpoint or a column for it**. A placeholder column `screen_time_minutes` was already here and stood empty for a year — it has been removed. See PRD §9 (backlog B2).
- Whoosh/Urent, book progress and podcast history are likewise without a public API → manual entry or research (PRD §9).

## Tool pitfalls

Moved into **[`docs/pitfalls.md`](docs/pitfalls.md)**: tool behaviour that looks like broken code —
Vitest environments, Playwright baselines, Liquibase comments, the shared database in `@QuarkusTest`,
bind mounts and image tags on the VPS, WebKit compositing layers. Stumbled on something twice? Write
it there, not here.

## Working process

- Changes go through a **feature branch plus a PR**, never straight into `main` (see the project memory).
- Commits: a bulleted list of changes; split large tasks; **never mention AI or an assistant** in commit messages (see the project memory).
- **One branch = one commit.** All of a feature's work (backend and infra / frontend / docs) is folded into a **single** commit before pushing and opening the PR. Review fixes do not breed commits — they accumulate and are squashed into that same one. When merging layers, **keep every bullet** from the messages being combined (concatenate; lose nothing). Non-interactive squash: `git commit --fixup` plus `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>`.
- **Versioning.** At the start of every new `feature/*` or `hotfix/*` branch, bump the project version in the branch's first commit (semver). There are **two independent** versions and they live in the code: the frontend in `frontend/package.json`, the backend in `backend/build.gradle.kts`. Bump the one the branch touches (both, if it touched both).
  - **Use the patch part generously for fixes and small changes.** A large new feature is a minor; cosmetics, UI polish, behavioural fixes and refinements of what already exists are a **patch**, not a minor. Do not spend a minor on every trifle: in doubt between minor and patch → patch.
- **A branch ends with a rebuild of the local stack and showing the result** (see "The local stack is
  the project's shop window"): `docker compose up -d --build <frontend|backend>`, then a screenshot or
  description of what changed on `localhost:3000`. The owner looks at the result where the site lives,
  not on a temporary server that dies with the session.

## Comments in code

Two hard limits, checked mechanically (`node scripts/check-comment-budget.mjs`, also
`npm run lint:comments` and a gate in the PR build):

1. **A comment block is at most 3 lines.** A block is a run of adjacent comment lines; prose counts,
   while `*/` and empty `*` do not. Longer ⇒ red PR. **A blank line between two blocks does not buy
   a second budget:** two neighbouring blocks that only make sense read together are one over-long
   comment wearing a disguise, and the ceiling is on what a comment carries, not on how it is
   punctuated. The material belongs in a document — see below. (The disguise does not even work in
   `#`-files: a bare `#` line continues the run instead of breaking it.)
2. **English only.** Cyrillic in a comment is a red PR. The `docs/` folder stays Russian; everything
   else in the repository — code, configs, build and deploy files, tests — is English. This covers
   a comment trailing a line of code and a one-line JSX `{/* … */}` as much as a block.

**Three lines is not a style preference, it is a ceiling on what a comment may carry.** Reasoning,
measurements, rejected alternatives and the history of a decision do not fit, and that is the point:
they belong in the docs. Wanting a fourth line is the signal that the material is a document's, not a
file's — open a paragraph in PRD or DESIGN beside its feature and leave the address in the code.

**A `§`-reference REPLACES the retelling; it never accompanies it.** This is the main source of
surplus text: next to `DESIGN §4.1` a six-line restatement of that same §4.1 grows, because volume
reads as diligence. If the content is already in a document, the code keeps **only the address**.

**What earns its place** (within the three lines):
- **Invariants and traps** — what will break and why: `// Scale by transform, not height: height
  re-runs layout on every frame. DESIGN §7.5`. These are regression anchors; they save reading the
  code, and they are short by nature.
- **A rejected alternative in one line, with a reference:** `// Rejected: X. DESIGN §N`.
- **What a type does not show:** a unit of measure (kopecks, metres, ms), the meaning of `null` or
  zero, a precondition, or a rescue for a misleading name (`VelobikeAuthRequest(user, password)` —
  actually a phone number and an SMS code).

**A comment that restates a name is not written at all.** `var tariffName` does not need "the tariff's
name", `fun latest()` does not need "the freshest record". That is not a short comment but an absent
one: it spends tokens on every read of the file and answers no question. Nothing from the list above
⇒ delete it rather than translate it.

**Never write, and clear out on sight:**
- **Session provenance** — "the owner asked", "agreed with the owner", quotes from a discussion. Who
  asked for a number does not help change it; the reason is valuable, the authorship is not.
- **Dead numbers and dead code** — "the former 600ms", "there used to be three rings". They describe
  what is no longer in the file: a reader goes looking, finds nothing, and stops trusting the
  neighbouring comments too. A stale comment is worse than a missing one.
- **A retelling of the process** — "started at 0.22, tried 0.17, settled on 0.20". That is a commit
  message that moved into a file; it belongs in the PR.

**The past tense is a signal to check.** "It used to be X" almost always rewrites into the present:
not "the axes used to be computed independently and the frame flattened", but "compute the axes
independently and the frame flattens". The same meaning, but it does not go stale and does not point
at code that no longer exists.

**No trace of an assistant in outgoing text.** The line "🤖 Generated with Claude Code" (and any
variant linking to claude.com) **goes nowhere**: not into a PR description, a comment, a commit
message, a document or the code. The same applies to `Co-Authored-By: Claude` signatures. This is
broader than the ban on mentioning AI in commits — it covers **any** text leaving for the repository
or GitHub. Found such a line in existing text? Remove it.

**A branch's outcome belongs in the PR and the commit message, not in the docs.** We no longer keep a
chronicle of work (`docs/journal.md` is frozen). Only long-lived things travel from a branch into the
docs: a rule goes into PRD or DESIGN beside its decision; a genuinely tried and rejected alternative
goes there too, as a line "considered and rejected: X, because Y"; a tool pitfall goes into
`docs/pitfalls.md`. There is no "current state" section in this file, and none should be started.

## Text density — the same rule for documents

A comment is capped at three lines (above); a document has no ceiling, so it needs the rule stated
rather than counted. Prose is compressed the way `caveman` compresses a payload: **lossy, but
reversible** — what a reader recomputes from the rest goes, what the rest does not hold stays. A
measurement, a reason, a rejected alternative are never recoverable from the surrounding text; a
retelling of the neighbouring paragraph always is.

- **An elision states the invariant computed from what it replaced.** Not a dozen same-shaped cases
  listed, but one line with the fact that holds across them — how many, the range, what they share.
  Caveman writes `340 rows elided: all state=charged; range 5.00..199.99`; a document writes "every
  wave takes the default edge, wave 02 declines it". The particular case is restored from the invariant.
- **Uniform records go as rows, not as prose** — the slice map in this file, the idea registry in
  PRD §9. A paragraph per item repeats the item's shape as many times as there are items.
- **One broad pass instead of a series of narrow ones.** A section is rewritten whole rather than
  grown by appendices: each appendix makes the reader re-read the ones before it, and the section
  ends up answering the same question twice, in two tenses.
- **Fails closed.** A shortening that does not make the text shorter, or that costs a fact, is rolled
  back and the text stays as it was. Brevity is not the goal — the goal is that nothing in the text
  is derivable from the text.

A `§`-reference REPLACES the retelling in a document exactly as it does in a comment, and the same
material is banned in both: session provenance, dead numbers, a retelling of the process.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **danchuo.world** (8981 symbols, 18621 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
