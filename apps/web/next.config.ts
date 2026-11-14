import type { NextConfig } from "next";
import os from "os";

function getLocalIpAddresses(): string[] {
  const ips: string[] = ["localhost", "127.0.0.1", "192.168.29.146"];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          ips.push(net.address);
        }
      }
    }
  } catch {
    // Ignore network interfaces lookup errors
  }
  return Array.from(new Set(ips));
}

const nextConfig: NextConfig = {
  // Allow local network IP access for testing on mobile and other LAN devices
  allowedDevOrigins: [
    ...getLocalIpAddresses(),
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
