"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import * as React from "react";

import { availableBasemaps, type BasemapId } from "@/components/events/basemaps";
import { CircleNotch, MapPin, Trash } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The map, with the chrome around it.
 *
 * Laid out the way a map application is, because that is the layout people have
 * already learned: the map fills the frame, the base-map switcher sits in a
 * corner over it, and the coordinate readout runs along the bottom. Controls
 * stacked above the map in a form column would be the same controls in a place
 * nobody looks for them.
 *
 * The map itself is a separate module loaded on demand — see location-map.
 */
const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <CircleNotch size={18} className="animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

export function LocationPicker({
  latitude,
  longitude,
  onMove,
  onClear,
  busy = false,
}: {
  latitude?: number;
  longitude?: number;
  onMove: (latitude: number, longitude: number) => void;
  onClear: () => void;
  /** True while the postcode lookup is in flight, so the map can say so. */
  busy?: boolean;
}) {
  const t = useTranslations("eventAdmin");
  const [basemap, setBasemap] = React.useState<BasemapId>("streets");
  const basemaps = React.useMemo(() => availableBasemaps(), []);

  const pinned = latitude !== undefined && longitude !== undefined;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="relative h-[360px] w-full bg-muted">
        <LocationMap
          latitude={latitude}
          longitude={longitude}
          onMove={onMove}
          label={t("map.label")}
          basemap={basemap}
        />

        {/* Bottom-left, over the map, where every map application puts it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
          <div className="pointer-events-auto flex rounded-md border border-border bg-card p-0.5 shadow-sm">
            {basemaps.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setBasemap(id)}
                aria-pressed={basemap === id}
                className={cn(
                  "h-7 rounded-[--radius] px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  basemap === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent-hover hover:text-foreground",
                )}
              >
                {t(`map.basemaps.${id}`)}
              </button>
            ))}
          </div>

          {pinned ? (
            <button
              type="button"
              onClick={onClear}
              className="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:text-destructive-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash size={13} aria-hidden />
              {t("map.clearPin")}
            </button>
          ) : null}
        </div>

        {busy ? (
          <div className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <CircleNotch size={12} className="animate-spin" aria-hidden />
            {t("lookup.loading")}
          </div>
        ) : null}
      </div>

      {/* The readout is a strip under the map rather than a caption beside it,
          so the numbers sit with the thing they describe and can be selected
          and pasted into another tool to be checked. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-card px-3 py-2 text-xs">
        <MapPin size={13} aria-hidden className="shrink-0 text-muted-foreground" />
        {pinned ? (
          <span className="tabular-nums text-foreground">
            {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("map.unpinnedHint")}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {pinned ? t("map.pinnedHint") : ""}
        </span>
      </div>
    </div>
  );
}
