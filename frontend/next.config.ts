import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Тонкий self-contained сервер для Docker-образа (docker-compose в корне).
  output: "standalone",
  experimental: {
    // Прокси Next буферизует проксируемое тело и по умолчанию режет его на 10MB — zip
    // фото-дропа (~100MB+) обрезается, и бэкенд получает битый multipart (ECONNRESET → 500).
    // Поднимаем лимит. В реальном проде /api проксирует Caddy (не Next) — там лимита нет.
    // (Next 15.x: ключ `middlewareClientMaxBodySize`; в 16 переименован в `proxyClientMaxBodySize`.)
    middlewareClientMaxBodySize: "600mb",
  },
  // Same-origin прокси к бэкенду: браузер бьёт в /api/* (тот же origin, без CORS),
  // Next-сервер проксирует на Quarkus. Зеркалит прод за Caddy. Цель — из env
  // (в Docker — http://backend:8080; локально по умолчанию — http://localhost:8080).
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
