# syntax=docker/dockerfile:1

# ── Dependencies ──
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Next.js build (standalone) ──
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* is inlined into the client bundle at build time. The browser reaches the API from the host,
# so this is the backend's host address (not the docker service name). Passed from compose as a build-arg.
# The /api/* proxy target is baked into rewrites at build time (Next computes them at build time),
# so it is a build-arg, not a runtime env. In compose = http://backend:8080.
ARG API_PROXY_TARGET=http://localhost:8080
ENV API_PROXY_TARGET=$API_PROXY_TARGET
# SITE_URL — the base URL for OG/canonical/robots/sitemap. robots.txt, sitemap.xml and
# opengraph-image are prerendered as STATIC files at build time, so the value is needed right here
# (build-arg), not only in the runtime env. Defaults to the prod domain; locally compose sends localhost.
ARG SITE_URL=https://danchuo.world
ENV SITE_URL=$SITE_URL
# "1" marks today as a bouldering day until the backend sends it; only the local compose sets it.
ARG NEXT_PUBLIC_DEMO_BOULDERING=
ENV NEXT_PUBLIC_DEMO_BOULDERING=$NEXT_PUBLIC_DEMO_BOULDERING
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime: only the standalone output ──
FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
