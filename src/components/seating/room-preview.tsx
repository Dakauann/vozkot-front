"use client";

import * as React from "react";

import { boundsOf, isAccessibleKind, type LayoutSeat, type Marker } from "@/lib/seating/api";
import { cn } from "@/lib/utils";

/**
 * A drawn room, to look at and not to touch.
 *
 * It exists so that "is this the right room?" can be answered by looking. The
 * one place that asks is putting a layout on sale for a night, which is
 * irreversible once a seat is held — and picking the wrong plan from a dropdown
 * of names is exactly the mistake worth making impossible to make quietly.
 *
 * Deliberately not the builder. No dragging, no palette, no marking: a surface
 * that could edit here would be editing a room that other events are already
 * selling.
 */
export function RoomPreview({
  seats,
  markers,
  names,
  className,
}: {
  seats: LayoutSeat[];
  markers: Marker[];
  /** Section id to name, for the label drawn on each block. */
  names: Record<string, string>;
  className?: string;
}) {
  // The box holds the scenery as well as the chairs. A stage sits in front of
  // the first row, so bounds measured from seats alone clip it off.
  const box = React.useMemo(() => {
    const corners = markers.flatMap((marker) => [
      { x: marker.x, y: marker.y },
      { x: marker.x + marker.width, y: marker.y + marker.height },
    ]);
    const bounds = boundsOf([...seats, ...corners]);
    // A margin in the room's own units, so a chair on the edge is not drawn
    // half outside the frame.
    const margin = Math.max(bounds.width, bounds.height) * 0.04 + 12;
    return {
      x: bounds.minX - margin,
      y: bounds.minY - margin,
      width: bounds.width + margin * 2,
      height: bounds.height + margin * 2,
    };
  }, [seats, markers]);

  const bySection = React.useMemo(() => {
    const groups = new Map<string, LayoutSeat[]>();
    for (const seat of seats) {
      const existing = groups.get(seat.sectionId);
      if (existing) existing.push(seat);
      else groups.set(seat.sectionId, [seat]);
    }
    return [...groups.entries()];
  }, [seats]);

  if (seats.length === 0 && markers.length === 0) return null;

  // Labels scale with the room so they stay readable whatever the coordinate
  // space happens to be: a theatre generated at a 24-unit seat gap and an arena
  // at a radius of 300 are the same room to the generator.
  const label = Math.max(box.width, box.height) * 0.028;

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={Object.values(names).filter(Boolean).join(", ")}
      className={cn("rounded-[--radius] border border-border bg-card", className)}
    >
      {markers.map((marker) =>
        marker.kind === "arena" ? (
          <ellipse
            key={marker.id}
            cx={marker.x + marker.width / 2}
            cy={marker.y + marker.height / 2}
            rx={marker.width / 2}
            ry={marker.height / 2}
            className="fill-muted stroke-border-strong"
            strokeWidth={1.5}
          />
        ) : (
          <rect
            key={marker.id}
            x={marker.x}
            y={marker.y}
            width={marker.width}
            height={marker.height}
            rx={Math.min(marker.width, marker.height) * 0.15}
            className="fill-muted stroke-border-strong"
            strokeWidth={1.5}
          />
        ),
      )}

      {markers.map((marker) => (
        <text
          key={`${marker.id}-name`}
          x={marker.x + marker.width / 2}
          y={marker.y + marker.height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-muted-foreground font-semibold uppercase"
          style={{ fontSize: label }}
        >
          {marker.name}
        </text>
      ))}

      {bySection.map(([sectionId, sectionSeats]) => (
        <g key={sectionId}>
          {sectionSeats.map((seat) => (
            <circle
              key={seat.id}
              cx={seat.x}
              cy={seat.y}
              r={7}
              className={
                isAccessibleKind(seat.kind)
                  ? "fill-primary stroke-primary"
                  : "fill-muted stroke-border-strong"
              }
              strokeWidth={1.25}
            />
          ))}
        </g>
      ))}

      {/* The block's name, on the block. Without it the drawing is an anonymous
          field of dots and nobody can tell which sector they are pricing. */}
      {bySection.map(([sectionId, sectionSeats]) => {
        const name = names[sectionId];
        if (!name) return null;
        let x = 0;
        let y = 0;
        for (const seat of sectionSeats) {
          x += seat.x;
          y += seat.y;
        }
        return (
          <text
            key={`${sectionId}-name`}
            x={x / sectionSeats.length}
            y={y / sectionSeats.length}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground font-semibold"
            style={{ fontSize: label }}
          >
            {name}
          </text>
        );
      })}
    </svg>
  );
}
