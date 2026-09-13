import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  images: {
    // Ticket artwork is served by the API in development and by the R2 public
    // hostname in production. Both are read from the environment so a fork
    // points at its own bucket without touching this file.
    remotePatterns: [
      ...mediaPatterns(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"),
      ...mediaPatterns(process.env.NEXT_PUBLIC_MEDIA_URL),
    ],
  },
};

function mediaPatterns(origin: string | undefined) {
  if (!origin) return [];
  try {
    const url = new URL(origin);
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port,
        pathname: "/**",
      },
    ];
  } catch {
    return [];
  }
}

export default withNextIntl(nextConfig);
