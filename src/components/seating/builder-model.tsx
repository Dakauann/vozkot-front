"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { CaretDown, Check, Warning } from "@/components/icons";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { Compliance, LayoutSeat, SectionSpec } from "@/lib/seating/api";

/**
 * What a room is made of, and the panel that edits one piece of it.
 *
 * The builder's model is a flat list of OBJECTS. A block of seats, a standing
 * floor, a box, a stage, an arena — all the same kind of thing: something with
 * a position that you drop on a canvas and then adjust. That is the whole
 * reason the previous version's "focus" enum had to go: a stage was a mode with
 * one fixed position, so it could not be moved and a room could not have two.
 */

/** The objects the palette offers. */
export type Piece =
  | "linear"
  | "arc"
  | "tables"
  | "standing"
  | "booth"
  | "stage"
  | "arena";

export const PIECES: Piece[] = [
  "linear",
  "arc",
  "tables",
  "standing",
  "booth",
  "stage",
  "arena",
];

/**
 * A piece being edited: what it IS, plus which palette item it came from.
 *
 * Deliberately not where it is or how big it is. The canvas owns placement —
 * it is the thing being dragged — and a draft holding a second copy would
 * disagree with it the first time a drag landed while a preview was in flight.
 */
export type Draft = Omit<SectionSpec, "offsetX" | "offsetY" | "width" | "height"> & {
  key: string;
  piece: Piece;
};

/** Where and how big something is. The canvas is the authority. */
export type Placement = { offsetX: number; offsetY: number; width: number; height: number };

/** Scenery rather than inventory: drawn, never sold. */
export function isMarker(piece: Piece): boolean {
  return piece === "stage" || piece === "arena";
}

/** Counted stock rather than named chairs. */
export function isCounted(piece: Piece): boolean {
  return piece === "standing" || piece === "booth";
}

/**
 * How many rows a lettered block can have.
 *
 * A, B, C ... Z without I or O: 24 usable letters, because both read as digits
 * on a printed ticket in a dark room. An arena with forty rows is ordinary, and
 * it numbers them.
 */
const MAX_LETTERED_ROWS = 24;

let sequence = 0;

/**
 * A key no piece on the canvas already has.
 *
 * Exported because pasting needs one: a copy that reused its source's key would
 * be the same node twice, and React Flow would render one of them.
 */
export function freshKey(): string {
  sequence += 1;
  return `p${sequence}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * How big a dropped piece starts out, in layout units.
 *
 * Null for a block of seats, whose size is its seats: a block that carried its
 * own dimensions would have two answers to how big it is, and the seats would
 * win while the number sat there being wrong.
 */
export function defaultSize(piece: Piece): { width: number; height: number } | null {
  switch (piece) {
    case "stage":
      // Wide and shallow, which is what a stage is, and small enough beside a
      // ring of stands that it does not cover the room it belongs to.
      return { width: 300, height: 60 };
    case "arena":
      return { width: 280, height: 280 };
    case "standing":
      return { width: 320, height: 200 };
    case "booth":
      // Room for the name, the people it holds and the line saying it is sold
      // whole. A box too small for its own contents is what made the first one
      // read as an empty rectangle.
      return { width: 180, height: 116 };
    default:
      return null;
  }
}

/**
 * A new piece, with defaults that produce something recognisable immediately.
 *
 * Every number here is a starting point to be dragged or typed over. They matter
 * anyway: an arena that defaults to a third of a circle draws as an
 * unrecognisable sliver, and a first render that does not look like the thing
 * you asked for is what makes a builder feel broken.
 */
export function newDraft(piece: Piece, order = 0): Draft {
  const base: Draft = {
    key: freshKey(),
    piece,
    name: "",
    kind: "seated",
    displayOrder: order,
  };
  switch (piece) {
    case "arc":
      return {
        ...base,
        rowShape: "arc",
        rows: 8,
        seatsPerRow: 24,
        rowLabels: "numbers",
        radius: 180,
        // A full ring, because that is what "arena" means. A partial stand is
        // one dropdown away and a legitimate thing to want; it is just a poor
        // first impression.
        startAngle: 0,
        sweepAngle: 360,
        // Pitch, not a fixed count: the rows get longer as they go out and gain
        // seats, the way chairs bolted to a real stand do.
        seatPitch: 26,
      };
    case "tables":
      return { ...base, tables: 8, seatsPerTable: 8, tablesPerRow: 4 };
    case "standing":
      return { ...base, kind: "standing", capacity: 500 };
    case "booth":
      return { ...base, kind: "booth", capacity: 10 };
    case "stage":
      return { ...base, kind: "stage" };
    case "arena":
      return { ...base, kind: "arena" };
    default:
      return {
        ...base,
        rowShape: "linear",
        rows: 10,
        seatsPerRow: 16,
        rowLabels: "letters",
        numbering: "sequential",
      };
  }
}

/**
 * What goes to the server: the piece, plus where the canvas put it.
 *
 * The palette origin stays behind — it is how the organiser chose the thing,
 * not part of the room.
 */
export function toSpec(draft: Draft, placement: Placement): SectionSpec {
  const { key, piece, ...spec } = draft;
  void key;
  void piece;
  return {
    ...spec,
    offsetX: Math.round(placement.offsetX),
    offsetY: Math.round(placement.offsetY),
    width: Math.round(placement.width),
    height: Math.round(placement.height),
  };
}

/**
 * How big a piece is, for the list.
 *
 * `actual` is the count from the generated room and wins whenever it is known.
 * Rows times seats-per-row is wrong for an arc — the rows gain seats as they go
 * out — and a summary that disagrees with the canvas beside it is worse than
 * none.
 */
export function describe(
  draft: Draft,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  actual?: number,
): string {
  if (isMarker(draft.piece)) return t("count.marker");
  if (isCounted(draft.piece)) return t("count.capacity", { capacity: draft.capacity ?? 0 });
  if (draft.piece === "tables") {
    return t("count.tables", {
      tables: draft.tables ?? 0,
      seats: actual ?? (draft.tables ?? 0) * (draft.seatsPerTable ?? 0),
    });
  }
  return t("count.rows", {
    rows: draft.rows ?? 0,
    seats: actual ?? (draft.rows ?? 0) * (draft.seatsPerRow ?? 0),
  });
}

// --- two things cannot occupy the same floor -------------------------------

/** How much two boxes may share before it counts as an overlap, in layout units. */
const TOUCHING = 1;

/**
 * The pieces that are drawn on top of something else.
 *
 * Mirrors the server's rule exactly, including the slack: adjacent sectors
 * share an edge — a balcony directly behind the stalls, two stands meeting at a
 * corner — and calling that a collision would flag almost every real venue.
 * BOTH dimensions have to genuinely overlap, because two sectors side by side
 * share a full span of one axis and none of the other.
 *
 * Returns the ids of every piece involved rather than the first pair, because
 * the canvas marks them all at once: an organiser who has nudged one block into
 * two others wants to see both problems, not to fix one and discover the next.
 */
export function collisionsIn(boxes: Record<string, Rect>): Set<string> {
  const entries = Object.entries(boxes).filter(([, box]) => box.width > 0 && box.height > 0);
  const hit = new Set<string>();
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [idA, a] = entries[i];
      const [idB, b] = entries[j];
      const shareX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const shareY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (shareX > TOUCHING && shareY > TOUCHING) {
        hit.add(idA);
        hit.add(idB);
      }
    }
  }
  return hit;
}

/** A piece's footprint on the canvas, in layout units. */
export type Rect = { x: number; y: number; width: number; height: number };

// --- the geometry a canvas draws a block in ---------------------------------

/** A block's seats as the server generated them, and the frame they need. */
export type BlockGeometry = {
  seats: LayoutSeat[];
  /** The top-left of the seats themselves, which they are drawn relative to. */
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/** The bounding box of a set of points, in layout units. */
export function extentOf(points: { x: number; y: number }[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

/**
 * Group a previewed room into one frame per piece on the canvas.
 *
 * Two things here are load-bearing and were both wrong once.
 *
 * The frame is measured from the SEATS, never from the offset the server echoed
 * back. It used to be `maxSeatX - section.offsetX`, which trusts two numbers to
 * agree about where a block begins; when they disagreed the frame came out too
 * small and an SVG clips, so sixteen seats per row drew as nine.
 *
 * And a response is matched to the canvas by the ORDER THE REQUEST WAS BUILT IN,
 * carried alongside it. The server has no idea what a node is: it returns a list
 * in the order the specs went out, and matching that against the CURRENT canvas
 * would paint one block's seats inside another block's frame the moment anything
 * was added or removed.
 */
export function blocksFrom(previewed: {
  keys: string[];
  sections: { id: string }[];
  seats: LayoutSeat[];
}): Record<string, BlockGeometry> {
  const found: Record<string, BlockGeometry> = {};
  const bySection = new Map<string, LayoutSeat[]>();
  for (const seat of previewed.seats) {
    const existing = bySection.get(seat.sectionId);
    if (existing) existing.push(seat);
    else bySection.set(seat.sectionId, [seat]);
  }
  previewed.sections.forEach((section, index) => {
    const key = previewed.keys[index];
    const seats = bySection.get(section.id);
    if (!key || !seats || seats.length === 0) return;
    const extent = extentOf(seats);
    found[key] = {
      seats,
      originX: extent.minX,
      originY: extent.minY,
      width: extent.width,
      height: extent.height,
    };
  });
  return found;
}

// --- the arc, described the way a venue describes itself ---------------------

const SIDES = { top: 0, right: 90, bottom: 180, left: 270, full: 0 } as const;
type Side = keyof typeof SIDES;
const WIDTHS = { quarter: 90, third: 120, half: 180, full: 360 } as const;
type Width = keyof typeof WIDTHS;

function arcShapeOf(draft: Draft): { side: Side; width: Width } {
  const sweep = draft.sweepAngle ?? 360;
  if (sweep >= 360) return { side: "full", width: "full" };
  const width = (Object.keys(WIDTHS) as Width[]).find((key) => WIDTHS[key] === sweep) ?? "third";
  const centre = ((draft.startAngle ?? 0) + sweep / 2 + 360) % 360;
  const side =
    (Object.keys(SIDES) as Side[])
      .filter((key) => key !== "full")
      .find((key) => Math.abs(SIDES[key] - centre) < 45) ?? "top";
  return { side, width };
}

function arcDegrees(side: Side, width: Width): { startAngle: number; sweepAngle: number } {
  const sweep = side === "full" ? 360 : WIDTHS[width];
  if (sweep >= 360) return { startAngle: 0, sweepAngle: 360 };
  return { startAngle: (SIDES[side] - sweep / 2 + 360) % 360, sweepAngle: sweep };
}

// --- the inspector -----------------------------------------------------------

/**
 * The selected piece's properties.
 *
 * Two fields, then a disclosure. The two that define a block are always visible;
 * aisles, lettering, curvature and bearings are adjustments. Eight fields of
 * equal weight made none of them look like the ones that mattered.
 */
export function PieceInspector({
  draft,
  size,
  onChange,
  onResize,
  disabled,
}: {
  draft: Draft;
  /** The canvas's size for this piece, which is the authority. */
  size: { width: number; height: number };
  onChange: (next: Draft) => void;
  onResize: (size: { width: number; height: number }) => void;
  disabled: boolean;
}) {
  const t = useTranslations("layoutStudio");
  const [open, setOpen] = React.useState(false);
  const id = (field: string) => `p-${draft.key}-${field}`;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const number = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const marker = isMarker(draft.piece);
  const counted = isCounted(draft.piece);
  // Whether this block is past the point where lettering was swapped for
  // numbering, so the field can say why the dropdown moved under it.
  const lettersRanOut = (draft.rows ?? 0) > MAX_LETTERED_ROWS;
  const tables = draft.piece === "tables";
  const arc = draft.piece === "arc";

  return (
    <section aria-labelledby={id("heading")} className="space-y-3">
      <div>
        <h2 id={id("heading")} className="legend">
          {t(`piece.${draft.piece}`)}
        </h2>
        <p className="mt-1 text-[0.6875rem] leading-4 text-muted-foreground">
          {t(`pieceHint.${draft.piece}`)}
        </p>
      </div>

      <Field id={id("name")} label={t("fields.name")} hint={t("fields.nameHint")}>
        <ElevatedInput
          id={id("name")}
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder={t(`namePlaceholder.${draft.piece}`)}
          disabled={disabled}
        />
      </Field>

      {/* A marker is a shape. Its size IS its definition, so it comes first and
          there is nothing else to say about it. */}
      {marker ? (
        <div className="grid grid-cols-2 gap-2">
          <Field id={id("w")} label={draft.piece === "arena" ? t("fields.diameter") : t("fields.width")}>
            <ElevatedInput
              id={id("w")}
              type="number"
              min={20}
              value={Math.round(size.width)}
              onChange={(event) => {
                const width = number(event.target.value);
                // An arena is round, so one number sizes it and the two cannot
                // drift into an ellipse nobody asked for.
                onResize(
                  draft.piece === "arena"
                    ? { width, height: width }
                    : { width, height: size.height },
                );
              }}
              disabled={disabled}
            />
          </Field>
          {draft.piece !== "arena" ? (
            <Field id={id("h")} label={t("fields.depth")}>
              <ElevatedInput
                id={id("h")}
                type="number"
                min={20}
                value={Math.round(size.height)}
                onChange={(event) =>
                  onResize({ width: size.width, height: number(event.target.value) })
                }
                disabled={disabled}
              />
            </Field>
          ) : null}
        </div>
      ) : counted ? (
        <Field id={id("capacity")} label={t("fields.capacity")} hint={t(`capacityHint.${draft.piece}`)}>
          <ElevatedInput
            id={id("capacity")}
            type="number"
            min={1}
            value={draft.capacity ?? ""}
            onChange={(event) => set({ capacity: number(event.target.value) })}
            disabled={disabled}
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field
            id={id("a")}
            label={tables ? t("fields.tables") : t("fields.rows")}
            hint={lettersRanOut ? t("fields.rowsNumbered") : undefined}
          >
            <ElevatedInput
              id={id("a")}
              type="number"
              min={1}
              value={(tables ? draft.tables : draft.rows) ?? ""}
              onChange={(event) => {
                if (tables) {
                  set({ tables: number(event.target.value) });
                  return;
                }
                const rows = number(event.target.value);
                // Past 24 the letters run out, and that is precisely what the
                // numbering choice exists for. Switching it is what the
                // organiser meant; refusing the row was the server telling them
                // to go and find a dropdown they had no reason to look at.
                set(
                  rows > MAX_LETTERED_ROWS && (draft.rowLabels ?? "letters") !== "numbers"
                    ? { rows, rowLabels: "numbers" }
                    : { rows },
                );
              }}
              disabled={disabled}
            />
          </Field>
          <Field
            id={id("b")}
            label={
              tables
                ? t("fields.seatsPerTable")
                : arc
                  ? t("fields.seatPitch")
                  : t("fields.seatsPerRow")
            }
          >
            <ElevatedInput
              id={id("b")}
              type="number"
              min={1}
              value={(tables ? draft.seatsPerTable : arc ? draft.seatPitch : draft.seatsPerRow) ?? ""}
              onChange={(event) =>
                set(
                  tables
                    ? { seatsPerTable: number(event.target.value) }
                    : arc
                      ? { seatPitch: number(event.target.value) }
                      : { seatsPerRow: number(event.target.value) },
                )
              }
              disabled={disabled}
            />
          </Field>
        </div>
      )}

      {arc ? <ArcPlacement draft={draft} onChange={onChange} disabled={disabled} /> : null}

      {!marker && !counted ? (
        <div className="border-t border-border pt-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("adjustments")}
            <CaretDown
              className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {open ? (
            <div className="space-y-3 pb-1">
              {tables ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field id={id("perRow")} label={t("fields.tablesPerRow")}>
                    <ElevatedInput
                      id={id("perRow")}
                      type="number"
                      min={1}
                      value={draft.tablesPerRow ?? ""}
                      onChange={(event) => set({ tablesPerRow: number(event.target.value) })}
                      disabled={disabled}
                    />
                  </Field>
                  <Field id={id("firstTable")} label={t("fields.firstTable")}>
                    <ElevatedInput
                      id={id("firstTable")}
                      type="number"
                      min={1}
                      value={draft.firstTable ?? ""}
                      onChange={(event) => set({ firstTable: number(event.target.value) })}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <Field id={id("skips")} label={t("fields.skips")} hint={t("fields.skipsHint")}>
                    <ElevatedInput
                      id={id("skips")}
                      value={(draft.skips ?? []).join(", ")}
                      onChange={(event) =>
                        set({
                          skips: event.target.value
                            .split(",")
                            .map((part) => Number(part.trim()))
                            .filter((value) => Number.isInteger(value) && value > 0),
                        })
                      }
                      placeholder="6, 14"
                      disabled={disabled}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field id={id("rowLabels")} label={t("fields.rowLabels")}>
                      <SelectField
                        id={id("rowLabels")}
                        value={draft.rowLabels ?? "letters"}
                        onChange={(event) =>
                          set({ rowLabels: event.target.value as Draft["rowLabels"] })
                        }
                        disabled={disabled}
                      >
                        <option value="letters">{t("rowLabels.letters")}</option>
                        <option value="numbers">{t("rowLabels.numbers")}</option>
                      </SelectField>
                    </Field>
                    <Field id={id("firstRow")} label={t("fields.firstRow")}>
                      <ElevatedInput
                        id={id("firstRow")}
                        value={draft.firstRowLetter ?? ""}
                        onChange={(event) =>
                          set({ firstRowLetter: event.target.value.toUpperCase() })
                        }
                        placeholder={draft.rowLabels === "numbers" ? "1" : "A"}
                        disabled={disabled}
                      />
                    </Field>
                  </div>
                  <Field
                    id={id("numbering")}
                    label={t("fields.numbering")}
                    hint={t(`numberingHint.${draft.numbering ?? "sequential"}`)}
                  >
                    <SelectField
                      id={id("numbering")}
                      value={draft.numbering ?? "sequential"}
                      onChange={(event) =>
                        set({ numbering: event.target.value as Draft["numbering"] })
                      }
                      disabled={disabled}
                    >
                      <option value="sequential">{t("numbering.sequential")}</option>
                      <option value="odd_even">{t("numbering.odd_even")}</option>
                    </SelectField>
                  </Field>
                  {!arc ? (
                    <Field id={id("curve")} label={t("fields.curve")} hint={t("fields.curveHint")}>
                      <ElevatedInput
                        id={id("curve")}
                        type="number"
                        min={0}
                        value={draft.curve ?? 0}
                        onChange={(event) => set({ curve: number(event.target.value) })}
                        disabled={disabled}
                      />
                    </Field>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ArcPlacement({
  draft,
  onChange,
  disabled,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  disabled: boolean;
}) {
  const t = useTranslations("layoutStudio");
  const { side, width } = arcShapeOf(draft);
  const id = (field: string) => `arc-${draft.key}-${field}`;
  const apply = (nextSide: Side, nextWidth: Width) =>
    onChange({ ...draft, ...arcDegrees(nextSide, nextWidth) });

  return (
    <div className="space-y-3">
      <Field id={id("radius")} label={t("fields.radius")} hint={t("fields.radiusHint")}>
        <ElevatedInput
          id={id("radius")}
          type="number"
          min={1}
          value={draft.radius ?? ""}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange({ ...draft, radius: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
          }}
          disabled={disabled}
        />
      </Field>
      <Field id={id("side")} label={t("fields.side")} hint={t("fields.sideHint")}>
        <SelectField
          id={id("side")}
          value={side}
          onChange={(event) => apply(event.target.value as Side, width)}
          disabled={disabled}
        >
          {(Object.keys(SIDES) as Side[]).map((option) => (
            <option key={option} value={option}>
              {t(`side.${option}`)}
            </option>
          ))}
        </SelectField>
      </Field>
      {side !== "full" ? (
        <Field id={id("width")} label={t("fields.arcWidth")}>
          <SelectField
            id={id("width")}
            value={width}
            onChange={(event) => apply(side, event.target.value as Width)}
            disabled={disabled}
          >
            {(Object.keys(WIDTHS) as Width[])
              .filter((option) => option !== "full")
              .map((option) => (
                <option key={option} value={option}>
                  {t(`arcWidth.${option}`)}
                </option>
              ))}
          </SelectField>
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Accessibility, and the action that satisfies it.
 *
 * The warning used to end with "mark the seats in the section form" while no
 * control anywhere could mark a seat. The button applies the server's own
 * choice, and any of them can be moved afterwards by clicking a chair.
 */
export function CompliancePanel({
  report,
  fixable,
  onFix,
}: {
  report: Compliance;
  fixable: boolean;
  onFix: () => void;
}) {
  const t = useTranslations("layoutStudio");
  const rows = [
    { key: "wheelchair", required: report.requiredWheelchair, have: report.haveWheelchair },
    { key: "companion", required: report.requiredWheelchair, have: report.haveCompanion },
    {
      key: "reducedMobility",
      required: report.requiredReducedMobility,
      have: report.haveReducedMobility,
    },
    { key: "obese", required: report.requiredObese, have: report.haveObese },
  ].filter((row) => row.have < row.required);

  if (report.compliant) {
    return (
      <p className="mt-5 flex items-start gap-1.5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        <Check className="mt-0.5 size-3.5 shrink-0 text-healthy-ink" aria-hidden="true" />
        {t("compliance.okLong", { capacity: report.capacity })}
      </p>
    );
  }

  return (
    <section aria-labelledby="compliance-heading" className="mt-5 border-t border-border pt-4">
      <h2
        id="compliance-heading"
        className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
      >
        <Warning className="size-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
        {t("compliance.title")}
      </h2>
      <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
        {t("compliance.basis", { capacity: report.capacity })}
      </p>
      <ul className="mt-2 space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="text-xs leading-5 text-foreground">
            {t("compliance.missing", {
              count: row.required - row.have,
              kind: t(`compliance.${row.key}`),
            })}
          </li>
        ))}
      </ul>
      {fixable ? (
        <>
          <Button type="button" size="sm" onClick={onFix} className="mt-3">
            {t("compliance.fix")}
          </Button>
          <p className="mt-2 text-[0.6875rem] leading-5 text-muted-foreground">
            {t("compliance.fixHint")}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[0.6875rem] leading-5 text-muted-foreground">
          {t("compliance.how")}
        </p>
      )}
    </section>
  );
}

/**
 * The diagrams on the palette.
 *
 * They do real work: choosing between "fileiras retas", "arena" and "mesas"
 * from words alone is guessing, and the same words beside a picture of the
 * resulting shape need no explanation at all.
 */
export function PieceDiagram({ piece, className }: { piece: Piece; className?: string }) {
  const dot = "fill-current";
  const props = {
    width: 44,
    height: 30,
    viewBox: "0 0 44 30",
    "aria-hidden": true as const,
    className,
  };

  if (piece === "linear") {
    return (
      <svg {...props}>
        {[9, 15, 21].map((y) =>
          [10, 16, 22, 28, 34].map((x) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2} className={dot} />
          )),
        )}
      </svg>
    );
  }
  if (piece === "arc") {
    return (
      <svg {...props}>
        {[10, 13.5].map((radius) =>
          [-60, -30, 0, 30, 60, 120, 150, 180, 210, 240].map((degrees) => {
            const radians = (degrees * Math.PI) / 180;
            return (
              <circle
                key={`${radius}-${degrees}`}
                cx={22 + radius * Math.sin(radians)}
                cy={15 - radius * Math.cos(radians)}
                r={1.7}
                className={dot}
              />
            );
          }),
        )}
      </svg>
    );
  }
  if (piece === "tables") {
    return (
      <svg {...props}>
        {[12, 32].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={15} r={4} className="fill-current opacity-35" />
            {[0, 60, 120, 180, 240, 300].map((degrees) => {
              const radians = (degrees * Math.PI) / 180;
              return (
                <circle
                  key={degrees}
                  cx={cx + 7.5 * Math.sin(radians)}
                  cy={15 - 7.5 * Math.cos(radians)}
                  r={1.7}
                  className={dot}
                />
              );
            })}
          </g>
        ))}
      </svg>
    );
  }
  if (piece === "booth") {
    // ONE box with people in it, because one piece is one camarote. Four boxes
    // said the opposite of what a drop does, and an organiser with eight
    // camarotes places eight of them where the eight actually are.
    return (
      <svg {...props}>
        <rect
          x={9}
          y={7}
          width={26}
          height={16}
          rx={3}
          className="fill-none stroke-current"
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
        {[13, 18, 23, 28].map((x) =>
          [12, 18].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} className={dot} />
          )),
        )}
      </svg>
    );
  }
  if (piece === "stage") {
    return (
      <svg {...props}>
        <rect x={6} y={10} width={32} height={10} rx={3} className={dot} />
      </svg>
    );
  }
  if (piece === "arena") {
    return (
      <svg {...props}>
        <circle cx={22} cy={15} r={10} className={dot} />
      </svg>
    );
  }
  // Standing: a crowd, deliberately irregular, because the irregularity is the
  // difference being chosen.
  return (
    <svg {...props}>
      {[
        [11, 10],
        [17, 13],
        [23, 9],
        [29, 13],
        [34, 11],
        [14, 19],
        [20, 21],
        [26, 18],
        [32, 20],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2} className={dot} />
      ))}
    </svg>
  );
}
