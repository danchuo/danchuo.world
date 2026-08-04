#!/usr/bin/env bash
# Прогон/генерация эталонов визуальной регрессии в официальном Playwright-образе
# (PRD §12 M5: эталоны снимаются в Docker ради стабильного рендера шрифтов в CI —
# локальный win/mac рендер отличается субпиксельно и плодил бы ложные диффы).
#
# Требует запущенного сайта на хосте (docker compose up). По умолчанию бьёт в
# host.docker.internal:3000; переопределить — PW_BASE_URL.
#   bash e2e/docker-baseline.sh run      # прогнать против эталонов (CI-режим)
#   bash e2e/docker-baseline.sh update   # перегенерировать эталоны
set -euo pipefail
cd "$(dirname "$0")/.."

PW_VERSION="$(node -p "require('@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
MODE="${1:-run}"
ARGS=""
# Именно `=all`, а не голый `--update-snapshots`: голый флаг работает в режиме `changed` и
# переписывает только те эталоны, что НЕ сошлись. Расхождение мельче допуска
# `maxDiffPixelRatio` (0.01) сходится — и эталон остаётся со старым рендером, хотя команду
# «переснять» уже дали. Так десктопный календарь пережил появление ряда навигации.
[ "$MODE" = "update" ] && ARGS="--update-snapshots=all"
BASE_URL="${PW_BASE_URL:-http://host.docker.internal:3000}"

# Путь-источник тома: на git-bash (Windows) берём Windows-форму (pwd -W → C:/...),
# иначе обычный pwd. MSYS_NO_PATHCONV=1 не даёт MSYS манглить контейнерные пути (/work и пр.).
HOST_PWD="$(pwd)"
if pwd -W >/dev/null 2>&1; then HOST_PWD="$(pwd -W)"; fi

# Анонимный том на /work/node_modules: контейнер ставит свой linux-биндинг @playwright/test,
# не затирая host-овый node_modules (win-бинарники остаются рабочими для dev/vitest).
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${HOST_PWD}":/work -v /work/node_modules \
  -w /work \
  --add-host host.docker.internal:host-gateway \
  -e PW_BASE_URL="$BASE_URL" -e CI=1 \
  "$IMAGE" \
  bash -c "npm i --no-save --no-audit --no-fund @playwright/test@${PW_VERSION} >/dev/null 2>&1 && npx playwright test ${ARGS}"
