import type { NextConfig } from "next";

const PUSHPIN_HOST = process.env.PUSHPIN_HOST || "pushpin";
const PUSHPIN_PORT = process.env.PUSHPIN_PORT || "7999";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Rewrite /api/* to pushpin for SSE/WebSocket connections
      {
        source: "/api/:path*",
        destination: `http://${PUSHPIN_HOST}:${PUSHPIN_PORT}/internal/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
