# syntax=docker/dockerfile:1

# ── Зависимости ──
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Сборка Next.js (standalone) ──
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* инлайнится в клиентский бандл на этапе сборки. Браузер ходит к API с хоста,
# поэтому это host-адрес бэкенда (а не docker-имя сервиса). Прокидывается из compose как build-arg.
# Цель прокси /api/* запекается в rewrites на этапе сборки (Next вычисляет их в build-time),
# поэтому это build-arg, а не runtime-env. В compose = http://backend:8080.
ARG API_PROXY_TARGET=http://localhost:8080
ENV API_PROXY_TARGET=$API_PROXY_TARGET
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Рантайм: только standalone-вывод ──
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
