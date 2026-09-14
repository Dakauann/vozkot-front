import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".tmp/**",
    "out/**",
    "next-env.d.ts",
    // Vendor bundles copied out of node_modules on every dev and build run,
    // see scripts/copy-maplibre-worker.mjs. Nothing here is ours to fix.
    "public/maplibre-gl-*.mjs",
  ]),
]);
