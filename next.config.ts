import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  images: {
    // A custom loader, because the API already did the resizing. The media
    // pipeline writes a 400, 800 and 1600px copy of every upload, so the
    // browser asks for one of those by name instead of asking Next to fetch
    // the original and resize it again per size, per image, per request.
    loader: "custom",
    loaderFile: "./src/lib/images/loader.ts",
    // The exact widths the pipeline generates, so next/image builds a srcset
    // of files that exist rather than of sizes the loader has to round.
    deviceSizes: [400, 800, 1600],
    imageSizes: [400],
    // Kept for the optimiser'''s benefit if the loader is ever removed, and
    // because next/image still validates remote hosts in some code paths.
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
