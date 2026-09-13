/**
 * The base maps an operator can switch between.
 *
 * In its own module, and that is not tidiness: the picker needs the list to
 * draw the switcher, and the picker is eager while the map is lazy. If this
 * lived in location-map, importing the list would import MapLibre with it and
 * undo the whole point of loading the map on demand.
 *
 * Three OpenFreeMap styles, which is the only reason there are three: they cost
 * nothing extra, need no key and carry the same licence, so offering a choice
 * is free.
 */

export const BASEMAP_STYLES = {
  streets: "https://tiles.openfreemap.org/styles/liberty",
  bright: "https://tiles.openfreemap.org/styles/bright",
  minimal: "https://tiles.openfreemap.org/styles/positron",
} as const;

export type BasemapId = keyof typeof BASEMAP_STYLES | "satellite";

/**
 * Satellite imagery, only when a key is configured.
 *
 * Deliberately not pointed at one of the open imagery servers. Every layer that
 * is free to fetch — Esri World Imagery, the various Sentinel mirrors —
 * restricts commercial use, and a box office selling tickets is exactly the use
 * they restrict. With NEXT_PUBLIC_MAPTILER_KEY set the option appears; without
 * one it is not offered at all, which is the honest behaviour rather than a
 * licence violation nothing in the code would ever flag.
 */
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

/** The ids to offer, given what this deployment is actually licensed for. */
export function availableBasemaps(): BasemapId[] {
  const ids: BasemapId[] = ["streets", "bright", "minimal"];
  if (MAPTILER_KEY !== "") ids.push("satellite");
  return ids;
}

/** The style URL MapLibre loads for one id. */
export function basemapStyleURL(id: BasemapId): string {
  if (id === "satellite") {
    return `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`;
  }
  return BASEMAP_STYLES[id];
}
