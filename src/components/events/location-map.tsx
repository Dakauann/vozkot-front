"use client";

import {
  GeolocateControl,
  MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type MapMouseEvent,
} from "maplibre-gl";
import * as React from "react";

import { basemapStyleURL, type BasemapId } from "@/components/events/basemaps";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The draggable venue pin.
 *
 * This module is the heavy one — MapLibre is around 200 KB gzipped — and it is
 * never imported directly. The form loads it through next/dynamic with ssr
 * false, so it stays out of every buyer-facing bundle and out of the server
 * render, where `window` does not exist.
 *
 * Two things keep it from feeling slow. The map is not created until its
 * container is actually on screen, so opening the form costs nothing; and tile
 * fades are switched off, because a 300ms cross-fade on every tile is most of
 * what makes a web map feel sluggish next to a native one.
 *
 * Tiles come from OpenFreeMap: vector tiles, no API key, no rate limit, and a
 * licence that permits production use. That last point is why it beats the
 * public OpenStreetMap raster server, whose tile policy asks apps not to do
 * this, and why it beats a keyed provider whose terms forbid storing the
 * coordinates we are explicitly here to store.
 */

/** Where the map opens when an event has no coordinates yet. Brazil, whole. */
const FALLBACK = { latitude: -14.235, longitude: -51.925, zoom: 3 };

/** Close enough to see which side of the street a venue is on. */
const PLACED_ZOOM = 16;

export interface LocationMapProps {
  latitude?: number;
  longitude?: number;
  /** Fired when the operator drops the pin somewhere new. */
  onMove: (latitude: number, longitude: number) => void;
  /** A read-only map still pans and zooms; it just cannot be re-pinned. */
  readOnly?: boolean;
  label: string;
  basemap?: BasemapId;
}

export default function LocationMap({
  latitude,
  longitude,
  onMove,
  readOnly = false,
  label,
  basemap = "streets",
}: LocationMapProps) {
  const container = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const marker = React.useRef<Marker | null>(null);

  // The callback is held in a ref so the map is built exactly once. Putting
  // onMove in the effect's dependencies would tear the map down and rebuild it
  // on every parent render, which loses the operator's pan and zoom mid-drag.
  const onMoveRef = React.useRef(onMove);
  React.useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // The initial camera is read from a ref, not from the dependency list: the
  // map is created once, and the position effect below keeps it in step after
  // that. Reading it here through state would rebuild the map on every nudge.
  const initial = React.useRef({ latitude, longitude });
  const [ready, setReady] = React.useState(false);

  const placed = isPlaced(latitude, longitude);

  React.useEffect(() => {
    const node = container.current;
    if (!node || map.current) return;

    // Built only once the container is actually on screen. A map in a section
    // the operator has not scrolled to yet costs a style download, a font
    // download and a screenful of tiles for something nobody is looking at.
    let cancelled = false;
    const build = () => {
      if (cancelled || map.current || !container.current) return;

      const start = initial.current;
      const hasStart = isPlaced(start.latitude, start.longitude);

      const instance = new MapLibreMap({
        container: container.current,
        style: basemapStyleURL(basemap),
        center: hasStart
          ? [start.longitude!, start.latitude!]
          : [FALLBACK.longitude, FALLBACK.latitude],
        zoom: hasStart ? PLACED_ZOOM : FALLBACK.zoom,
        // The operator is placing a pin, not surveying: rotating the map only
        // makes it harder to compare against a street address.
        dragRotate: false,
        pitchWithRotate: false,
        // No cross-fade. The default 300ms fade on every tile is the single
        // biggest reason a web map feels slower than the native one beside it.
        fadeDuration: 0,
        // A public preview should not steal a page scroll. Once focused, the
        // buyer can still pan and zoom it like any property-listing map.
        cooperativeGestures: readOnly,
        attributionControl: { compact: true },
      });

      instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
      instance.addControl(new GeolocateControl({ trackUserLocation: false }), "top-right");
      instance.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
      instance.keyboard.enable();
      instance.once("load", () => {
        if (!cancelled) setReady(true);
      });

      map.current = instance;
    };

    // IntersectionObserver where it exists, immediate everywhere else. A map
    // that never builds because a browser lacks the API is a broken form.
    if (typeof IntersectionObserver === "undefined") {
      build();
      return () => {
        cancelled = true;
        map.current?.remove();
        map.current = null;
        marker.current = null;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          build();
        }
      },
      // A little early, so it is ready by the time it is scrolled to.
      { rootMargin: "200px" },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Built once. Switching basemap is handled below, on the live instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching the base map replaces the style on the existing instance rather
  // than rebuilding it, so the camera and the pin survive the change.
  React.useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    instance.setStyle(basemapStyleURL(basemap));
  }, [basemap, ready]);

  // The marker follows the coordinates, whichever side moved them: the operator
  // dragging it, or the postcode lookup resolving an address they just typed.
  React.useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    if (!placed) {
      marker.current?.remove();
      marker.current = null;
      return;
    }

    const position: [number, number] = [longitude!, latitude!];

    if (!marker.current) {
      const pin = new Marker({ draggable: !readOnly, color: "#009a70" })
        .setLngLat(position)
        .addTo(instance);
      pin.on("dragend", () => {
        const { lat, lng } = pin.getLngLat();
        onMoveRef.current(round(lat), round(lng));
      });
      marker.current = pin;
    } else {
      marker.current.setLngLat(position);
      marker.current.setDraggable(!readOnly);
    }

    // Recentre only when the pin has left the view. Snapping back on every
    // small correction would fight an operator who has deliberately panned to
    // line the pin up against a landmark.
    if (!instance.getBounds().contains(position)) {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const target = { center: position, zoom: Math.max(instance.getZoom(), PLACED_ZOOM) };
      if (reduced) instance.jumpTo(target);
      else instance.flyTo({ ...target, speed: 1.6 });
    }
  }, [latitude, longitude, placed, readOnly, ready]);

  // Clicking is the other half of placing a pin, and the only way to place the
  // first one: there is no marker to drag until a point exists.
  React.useEffect(() => {
    const instance = map.current;
    if (!instance || readOnly || !ready) return;

    const handler = (event: MapMouseEvent) => {
      onMoveRef.current(round(event.lngLat.lat), round(event.lngLat.lng));
    };
    instance.on("click", handler);
    return () => {
      instance.off("click", handler);
    };
  }, [readOnly, ready]);

  return (
    <div
      ref={container}
      role="application"
      aria-label={label}
      className="h-full w-full"
    />
  );
}

/**
 * Coordinates count as placed only when both are present and real.
 *
 * Zero is a valid latitude and a valid longitude, so a truthiness check would
 * throw away a legitimate point on the equator. Null island is not our problem;
 * silently discarding a real coordinate is.
 */
function isPlaced(latitude?: number, longitude?: number): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/**
 * Six decimals, which is about ten centimetres.
 *
 * Matches what the API formats into a map URL. Keeping the full float would
 * store seventeen digits of precision for a pin someone placed by eye.
 */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
