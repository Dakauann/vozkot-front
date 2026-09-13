"use client";

import dynamic from "next/dynamic";

import { CircleNotch, MapPin } from "@/components/icons";

const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
      <span className="relative grid size-9 place-items-center rounded-md border border-border bg-card shadow-sm">
        <MapPin size={16} aria-hidden />
        <CircleNotch
          size={12}
          className="absolute -bottom-1 -right-1 animate-spin rounded-full bg-card"
          aria-hidden
        />
      </span>
    </div>
  ),
});

const ignoreMove = () => undefined;

/**
 * Buyer-facing venue map. The heavy MapLibre bundle is isolated behind a
 * client boundary and the underlying map waits until this section approaches
 * the viewport, keeping it out of the event page's first paint.
 */
export function EventLocationMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  return (
    <LocationMap
      latitude={latitude}
      longitude={longitude}
      onMove={ignoreMove}
      readOnly
      label={label}
      basemap="minimal"
    />
  );
}
