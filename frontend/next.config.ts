import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A thin self-contained server for the Docker image (docker-compose at the repo root).
  output: "standalone",
  // Photos only, re-encoded to AVIF at their own pixels (`photoUrl`); quality measured in PRD §8.
  images: {
    formats: ["image/avif"],
    qualities: [90],
    localPatterns: [
      { pathname: "/api/film-media/**" },
      { pathname: "/api/days/*/photo/**" },
      { pathname: "/api/instagram-media/**" },
    ],
  },
  experimental: {
    // Next's proxy buffers the body it forwards and caps it at 10MB by default, so a photo-drop
    // zip (~100MB+) is truncated and the backend gets broken multipart (ECONNRESET → 500). In real
    // production Caddy proxies the API, not Next. Renamed `proxyClientMaxBodySize` in Next 16.
    middlewareClientMaxBodySize: "600mb",
  },
  // Same-origin proxy to the backend: the browser hits /api/* on its own origin (no CORS) and the
  // Next server forwards to Quarkus, mirroring production behind Caddy. The target comes from env
  // (http://backend:8080 in Docker, http://localhost:8080 locally).
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
