# danchuo.world edge image: stock Caddy plus the two modules the Caddyfile needs.
#
# Why a custom image at all: `caddy:2` ships with neither a rate limiter nor a cache, and both
# live at the edge by necessity. The August 2026 load test made the case — ~1300 rps of plain
# GET / saturated the Next.js SSR process while the backend sat at 0.04% CPU, because nothing
# in front of Next could either refuse or absorb the flood. The backend's own RateLimitFilter
# only ever sees /api/*, so the HTML entry point was unguarded by construction.
#
# Modules:
#   caddy-ratelimit  — per-client token buckets at the edge, answers 429 without waking upstream
#   cache-handler    — Souin; lets one SSR render serve a burst instead of one render per request
#
# Deliberately unpinned: both modules are pre-1.0 and tag names move, so pinning here trades a
# build that breaks loudly in CI for one that breaks on a day nobody is looking. The Caddyfile
# is validated against THIS image during deploy, which is the check that actually matters.
FROM caddy:2-builder AS builder

RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddyserver/cache-handler

FROM caddy:2

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
