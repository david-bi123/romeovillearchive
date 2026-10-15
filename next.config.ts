import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production hardening
  poweredByHeader: false,
  reactStrictMode: true,

  // Server packages that must not be bundled into the serverless functions.
  serverExternalPackages: ["xlsx", "mysql2", "@node-rs/argon2"],

  // Tailwind CSS v4 runs through its Turbopack loader (see
  // node_modules/@tailwindcss/turbopack/README.md). Without this rule
  // `@import "tailwindcss"` is inlined raw and no utilities are generated,
  // which ships a completely unstyled site.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // The import wizard uploads spreadsheet payloads in chunks; allow up to 12 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
