"use client";

import * as React from "react";

import {
  boundsOf,
  isAccessibleKind,
  isSceneryKind,
  type LayoutSeat,
  type Marker,
} from "@/lib/seating/api";
import { cn } from "@/lib/utils";

/**
 * A drawn room, to look at and not to touch.
 *
 * It exists so that "is this the right room?" can be answered by looking. The
 * one place that asks is putting a layout on sale for a night, which is
 * irreversible once a seat is held, and picking the wrong plan from a dropdown
 * of names is exactly the mistake worth making impossible to make quietly.
 *
 * Deliberately not the builder. No dragging, no palette, no marking: a surface
 * that could edit here would be editing a room that other events are already
 * selling.
 */
/**
 * The categorical scale, as Tailwind class pairs.
 *
 * Written out rather than built from a template because Tailwind reads source
 * text: `fill-chart-${n}` compiles to nothing. Index 0 is "not being sold",
 * which is the room's own grey and not a colour in the scale.
 */
const TONES = [
  { fill: "fill-muted", stroke: "stroke-border-strong", seat: "fill-muted", chip: "bg-muted" },
  { fill: "fill-chart-1/15", stroke: "stroke-chart-1", seat: "fill-chart-1", chip: "bg-chart-1" },
  { fill: "fill-chart-2/15", stroke: "stroke-chart-2", seat: "fill-chart-2", chip: "bg-chart-2" },
  { fill: "fill-chart-3/15", stroke: "stroke-chart-3", seat: "fill-chart-3", chip: "bg-chart-3" },
  { fill: "fill-chart-4/15", stroke: "stroke-chart-4", seat: "fill-chart-4", chip: "bg-chart-4" },
  { fill: "fill-chart-5/15", stroke: "stroke-chart-5", seat: "fill-chart-5", chip: "bg-chart-5" },
] as const;

/** The scale position for one sellable unit, 1-based; 0 is not sold. */
export function toneAt(index: number): number {
  return (index % (TONES.length - 1)) + 1;
}

/**
 * The swatch a pricing row wears so the row and the plan read as one thing.
 *
 * A background, not the SVG `fill` the plan uses: the row's dot is an HTML
 * element and `fill-*` would leave it invisible.
 */
export function toneSwatch(tone: number): string {
  return (TONES[tone] ?? TONES[0]).chip;
}

export function RoomPreview({
  seats,
  markers,
  names,
  tones,
  className,
}: {
  seats: LayoutSeat[];
  markers: Marker[];
  /** Section id to name, for the label drawn on each block. */
  names: Record<string, string>;
  /**
   * What each sellable part of the room is being sold as, as a scale position.
   *
   * Keyed by SECTION ID for a standing floor or box, and by PRICE BAND for
   * chairs, because those are the two things an organiser actually prices. A
   * key that is absent, or 0, draws the part in the room's grey: that is how
   * "this is not on sale tonight" looks, and it has to be visible at a glance
   * rather than inferred from a dropdown reading "Do not sell".
   */
  tones?: Record<string, number>;
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
            className={cn(
              // Scenery is filled; counted floor is outlined, because one is
              // the room and the other is stock.
              isSceneryKind(marker.kind)
                ? "fill-muted stroke-border-strong"
                : "fill-none stroke-border-strong",
              // A priced floor or box drops the dashes and takes its colour:
              // solid means "this is being sold, as this".
              !isSceneryKind(marker.kind) &&
                TONES[tones?.[marker.id] ?? 0] &&
                (tones?.[marker.id] ?? 0) > 0 &&
                `${TONES[tones![marker.id]].fill} ${TONES[tones![marker.id]].stroke}`,
            )}
            strokeDasharray={
              isSceneryKind(marker.kind) || (tones?.[marker.id] ?? 0) > 0
                ? undefined
                : label * 2
            }
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
              className={cn(
                isAccessibleKind(seat.kind)
                  ? "fill-primary stroke-primary"
                  : "fill-muted stroke-border-strong",
                // The band's colour wins over the grey, but never over the
                // accessible chair: which seats a wheelchair user can book is
                // not a pricing decision and must not be repainted by one.
                !isAccessibleKind(seat.kind) &&
                  (tones?.[seat.category] ?? 0) > 0 &&
                  `${TONES[tones![seat.category]].seat} ${TONES[tones![seat.category]].stroke}`,
              )}
              strokeWidth={1.25}
            />
          ))}
        </g>
      ))}

      {/* The block's name, on the block. Without it the drawing is an anonymous
          field of dots and nobody can tell which sector they are pricing.

          A ring of stands is the case that breaks the obvious placement: its
          seats average out to the middle of the room, which is exactly where
          the arena those stands surround is drawn, so "Arquibancada" landed on
          top of "ARENA" and neither could be read. When the average lands
          inside a marker, the name goes above the block's topmost seats
          instead, which for a ring is the top of the stand and for every
          ordinary block never happens at all. */}
      {bySection.map(([sectionId, sectionSeats]) => {
        const name = names[sectionId];
        if (!name) return null;
        let x = 0;
        let y = 0;
        let top = Infinity;
        for (const seat of sectionSeats) {
          x += seat.x;
          y += seat.y;
          if (seat.y < top) top = seat.y;
        }
        const midX = x / sectionSeats.length;
        const midY = y / sectionSeats.length;
        const taken = markers.some(
          (marker) =>
            midX >= marker.x &&
            midX <= marker.x + marker.width &&
            midY >= marker.y &&
            midY <= marker.y + marker.height,
        );
        return (
          <text
            key={`${sectionId}-name`}
            x={midX}
            y={taken ? top - label : midY}
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
