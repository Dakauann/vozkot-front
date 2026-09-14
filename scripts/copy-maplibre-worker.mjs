/**
 * Puts MapLibre's tile worker somewhere the app can actually serve it.
 *
 * MapLibre v6 ships a split build: the main bundle, a shared chunk, and a
 * WORKER that parses vector tiles off the main thread. It finds that worker at
 * runtime by reading `import.meta.url` and looking for a sibling file:
 *
 *     new URL("./maplibre-gl-worker.mjs", import.meta.url)
 *
 * which is correct when the library is served from a CDN and wrong the moment a
 * bundler moves it. Under Turbopack `import.meta.url` is the app's own chunk in
 * `/_next/static/chunks/`, the worker is not beside it, and the request lands on
 * the Next.js 404 page. The browser then refuses it, "Failed to load module
 * script: the server responded with a non-JavaScript MIME type of text/html",
 * and MapLibre carries on WITHOUT a worker: the style loads, the controls and
 * the attribution draw, and no tile is ever parsed. A blank map, no error, on
 * the panel that tells a buyer where the venue is.
 *
 * So the two files are copied into public/ and the app pins the worker to that
 * path with setWorkerUrl. Copied rather than committed, and copied on every dev
 * and build run, because the worker and the bundle are two halves of one
 * version; a stale copy is a protocol mismatch, which is a harder bug than the
 * one this fixes. The shared chunk comes too: the worker imports it as a
 * sibling, so it has to BE one.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Resolved through the package rather than by walking up to node_modules, so a
// hoisted, linked or workspace install finds the same files the bundle did.
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const publicDir = join(process.cwd(), "public");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(publicDir, { recursive: true });
for (const file of FILES) {
  await copyFile(join(dist, file), join(publicDir, file));
}

console.log(`maplibre: copied ${FILES.join(", ")} into public/`);
