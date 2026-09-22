#!/usr/bin/env bash
# Runs/regenerates the visual regression baselines in the official Playwright image
# (PRD §12 M5: baselines are taken in Docker for stable font rendering in CI —
# local win/mac rendering differs at the subpixel level and would produce false diffs).
#
# Needs the site running on the host (docker compose up). Targets
# host.docker.internal:3000 by default; override with PW_BASE_URL.
#   bash e2e/docker-baseline.sh run      # run against the baselines (CI mode)
#   bash e2e/docker-baseline.sh update   # regenerate the baselines
set -euo pipefail
cd "$(dirname "$0")/.."

PW_VERSION="$(node -p "require('@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
MODE="${1:-run}"
ARGS=""
# Exactly `=all`, not a bare `--update-snapshots`: the bare flag works in `changed` mode and
# rewrites only the baselines that did NOT match. A difference below the
# `maxDiffPixelRatio` (0.01) tolerance matches — and the baseline keeps the old render even though
# a "retake" was ordered. That is how the desktop calendar survived the arrival of the navigation row.
[ "$MODE" = "update" ] && ARGS="--update-snapshots=all"
BASE_URL="${PW_BASE_URL:-http://host.docker.internal:3000}"

# Volume source path: on git-bash (Windows) take the Windows form (pwd -W → C:/...),
# otherwise plain pwd. MSYS_NO_PATHCONV=1 stops MSYS from mangling container paths (/work etc.).
HOST_PWD="$(pwd)"
if pwd -W >/dev/null 2>&1; then HOST_PWD="$(pwd -W)"; fi

# An anonymous volume on /work/node_modules: the container installs its own linux @playwright/test binding
# without overwriting the host's node_modules (the win binaries keep working for dev/vitest).
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${HOST_PWD}":/work -v /work/node_modules \
  -w /work \
  --add-host host.docker.internal:host-gateway \
  -e PW_BASE_URL="$BASE_URL" -e CI=1 \
  "$IMAGE" \
  bash -c "npm i --no-save --no-audit --no-fund @playwright/test@${PW_VERSION} >/dev/null 2>&1 && npx playwright test ${ARGS}"
