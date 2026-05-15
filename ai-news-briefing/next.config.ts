import type { NextConfig } from "next";

const dashboardOrigins = (
  process.env.DASHBOARD_EMBED_ORIGINS ??
  "http://localhost:3000 http://127.0.0.1:3000"
)
  .split(/\s+/)
  .filter(Boolean)
  .join(" ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["jsdom"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${dashboardOrigins};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
