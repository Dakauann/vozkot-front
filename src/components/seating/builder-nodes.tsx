"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { NodeResizeControl, type Node, type NodeProps } from "@xyflow/react";

import { isAccessibleKind, type SeatKind } from "@/lib/seating/api";
import { cn } from "@/lib/utils";
import {
  isMarker,
  type BlockGeometry,
  type Draft,
  type Piece,
} from "@/components/seating/builder-model";

/**
 * The things on the canvas.
 *
 * Three node types, because a room has three kinds of thing in it: a block of
 * named chairs, an area sold as a number, and scenery that is not sold at all.
 * All three are dragged the same way and live in the same coordinate space,
 * which is the point — the previous version could not move a stage because a
 * stage was not a thing, it was a word on the layout.
 */

/** Breathing room around a block's seats, in layout units. */
export const PAD = 16;
/** Extra at the top, for the block's name. */
export const PAD_TOP = 28;

/**
 * What the nodes need to draw, delivered by context rather than by node data.
 *
 * Node data would have to be rewritten every time a preview came back, which
 * means writing to the canvas's own store from an effect — and that store is
 * what the organiser is dragging. Reading through context leaves exactly one
 * writer: the person with the mouse.
 *
 * Everything here is identity-stable for the length of a drag. That is not
 * tidiness: a drag pushes a position change per mouse move, and if this object
 * changed with it, a seven-hundred-seat block would reconcile seven hundred
 * SVG circles per frame.
 */
export type BuilderView = {
  /** Geometry per node id. Absent while a block's first preview is in flight. */
  blocks: Record<string, BlockGeometry>;
  /** Chairs the server would mark to satisfy the law, keyed "ROW/SEAT". */
  suggested: Record<string, SeatKind>;
  /**
   * The one block the suggestion would be applied to.
   *
   * Scoped, because the keys are row and seat LABELS: two blocks both having a
   * row K seat 12 is ordinary, and ringing both would promise a fix in a place
   * it is not going to happen.
   */
  suggestFor: string | null;
  /** Whether clicking a chair changes its kind, rather than dragging the block. */
  marking: boolean;
  onMarkSeat: (nodeId: string, key: string) => void;
  /**
   * The pieces drawn on top of something else.
   *
   * Marked rather than prevented. Refusing the drag — snapping a piece back, or
   * pushing it aside — fights the mouse, and the organiser is often mid-
   * rearrangement, passing one block over another on the way somewhere
   * legitimate. The drag lands, the collision shows, and Save is what refuses.
   */
  collisions: Set<string>;
};

const EMPTY: BuilderView = {
  blocks: {},
  suggested: {},
  suggestFor: null,
  marking: false,
  onMarkSeat: () => {},
  collisions: new Set(),
};

const ViewContext = React.createContext<BuilderView>(EMPTY);

export function BuilderViewProvider({
  value,
  children,
}: {
  value: BuilderView;
  children: React.ReactNode;
}) {
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export type PieceData = { draft: Draft };
export type BuilderNode =
  | Node<PieceData, "block">
  | Node<PieceData, "area">
  | Node<PieceData, "marker">;

/** A piece's name, falling back to what the palette called it. */
function useName(draft: Draft): string {
  const t = useTranslations("layoutStudio");
  return draft.name.trim() || t(`defaultName.${draft.piece}`);
}

/**
 * What a piece is called, and how much of it there is.
 *
 * On every piece that sells something, in the same place, at the same size. A
 * canvas of anonymous rectangles is a canvas an organiser has to click through
 * to read, and the two facts anybody wants from a sector are its name and its
 * size.
 */
function Header({ name, amount, selected }: { name: string; amount: string; selected: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none flex items-baseline justify-between gap-2 rounded-t-[8px] px-2.5",
        selected ? "bg-primary/15" : "bg-muted/70",
      )}
      style={{ height: PAD_TOP - 6 }}
    >
      <span className="min-w-0 truncate font-semibold text-foreground" style={{ fontSize: 12 }}>
        {name}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground" style={{ fontSize: 10.5 }}>
        {amount}
      </span>
    </div>
  );
}

/**
 * A block of named chairs.
 *
 * The seats are drawn from the SERVER's geometry, never recomputed here. Laying
 * out rows, aisles, odd/even numbering and arc bearings a second time in
 * TypeScript would be two answers to "what does this room look like", and the
 * canvas would be the one that lies.
 */
export function BlockNode({ id, data, selected }: NodeProps<Node<PieceData, "block">>) {
  const t = useTranslations("layoutStudio");
  const { blocks, suggested, suggestFor, marking, onMarkSeat, collisions } =
    React.useContext(ViewContext);
  const geometry = blocks[id];
  const clashing = collisions.has(id);
  const name = useName(data.draft);
  const kinds = data.draft.seatKinds;
  const showSuggestions = suggestFor === id;

  // The chairs, kept out of the drag path. Their inputs do not change while a
  // block is being moved, so React reuses this array untouched and a drag
  // costs one repositioned box instead of a whole block of redrawn circles.
  const chairs = React.useMemo(() => {
    if (!geometry) return null;
    return geometry.seats.map((seat) => {
      const key = `${seat.row}/${seat.seat}`;
      const kind = kinds?.[key] ?? seat.kind;
      return (
        <Chair
          key={seat.id}
          x={seat.x - geometry.originX + PAD}
          y={seat.y - geometry.originY + PAD_TOP}
          kind={kind}
          suggested={showSuggestions && kind === "standard" && suggested[key] !== undefined}
          clickable={marking}
          onClick={marking ? () => onMarkSeat(id, key) : undefined}
        />
      );
    });
  }, [geometry, kinds, suggested, showSuggestions, marking, onMarkSeat, id]);

  if (!geometry) return <Drawing name={name} />;

  const width = geometry.width + PAD * 2;
  const height = geometry.height + PAD + PAD_TOP;

  return (
    <div
      className={cn(
        // No clipping: the drawing inside deliberately overflows so a frame
        // that comes out a seat too tight shows the seat rather than eating it.
        "relative rounded-[10px] border transition-colors",
        clashing
          ? "border-warning-ink ring-1 ring-warning-ink/40"
          : selected
            ? "border-primary ring-1 ring-primary/40"
            : "border-border-strong hover:border-foreground/30",
        marking ? "bg-card" : "bg-card/70",
      )}
      style={{ width, height }}
    >
      <Header
        name={name}
        amount={t("canvas.count", { seats: geometry.seats.length })}
        selected={!!selected}
      />

      {/* `overflow: visible` on the drawing, so a frame that comes out a seat
          too tight shows the seat hanging over its edge instead of silently
          swallowing it. A missing chair is a bug nobody can see; a chair over
          the line is one anybody can. */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        {chairs}
      </svg>
    </div>
  );
}

/**
 * A piece whose seats have not arrived yet.
 *
 * The server draws the room and that is a round trip, so there is a moment
 * where a dropped block is a name and nothing else. It says which piece it is
 * and that it is being drawn, because an empty dashed box says "this failed".
 */
function Drawing({ name }: { name: string }) {
  const t = useTranslations("layoutStudio");
  return (
    <div
      className="flex animate-pulse flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border-strong bg-card/60"
      style={{ width: 200, height: 120 }}
    >
      <span className="font-semibold text-foreground" style={{ fontSize: 13 }}>
        {name}
      </span>
      <span className="text-muted-foreground" style={{ fontSize: 11 }}>
        {t("canvas.drawing")}
      </span>
    </div>
  );
}

/**
 * How one chair is drawn.
 *
 * Shape, not colour alone, and not an icon. A Brazilian house map distinguishes
 * "cadeira para obesos" from "mobilidade reduzida" visually because the legend
 * has to be readable in print, at a glance, by somebody choosing a seat they
 * physically need — and because colour alone fails anybody who cannot tell two
 * of these apart.
 */
const Chair = React.memo(function Chair({
  x,
  y,
  kind,
  suggested,
  clickable,
  onClick,
}: {
  x: number;
  y: number;
  kind: SeatKind;
  suggested: boolean;
  clickable: boolean;
  onClick?: () => void;
}) {
  const paint = isAccessibleKind(kind)
    ? "fill-primary stroke-primary"
    : kind === "restricted_view"
      ? "fill-muted stroke-warning-ink"
      : "fill-muted stroke-border-strong";
  const shared = cn(paint, clickable && "cursor-pointer hover:fill-primary-subtle");

  return (
    // `nodrag` is React Flow's opt-out: without it a press on a chair starts
    // dragging the whole block, and marking a seat would move the room.
    <g
      className={clickable ? "nodrag" : undefined}
      style={{ pointerEvents: clickable ? "auto" : "none" }}
      onClick={onClick}
    >
      {/* A chair the server would pick to satisfy a quota. Drawn AROUND the
          seat rather than instead of it, so "what Fix would do" and "what this
          seat is" stay two separate readings. */}
      {suggested ? (
        <circle
          cx={x}
          cy={y}
          r={11}
          className="fill-none stroke-primary/50"
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
      ) : null}

      {kind === "wheelchair" || kind === "companion" ? (
        // A square: a wheelchair SPACE has no chair in it, and its companion
        // seat is the pair the law requires, so the two read as one unit.
        <rect
          x={x - 7}
          y={y - 7}
          width={14}
          height={14}
          rx={2.5}
          className={cn(shared, kind === "companion" && "fill-primary-subtle")}
          strokeWidth={1.5}
        />
      ) : kind === "obese" ? (
        // Wider, because that is literally what the seat is.
        <rect
          x={x - 9}
          y={y - 6}
          width={18}
          height={12}
          rx={6}
          className={shared}
          strokeWidth={1.5}
        />
      ) : kind === "reduced_mobility" ? (
        <>
          <circle cx={x} cy={y} r={7} className={shared} strokeWidth={1.5} />
          <circle cx={x} cy={y} r={2.5} className="pointer-events-none fill-card" />
        </>
      ) : (
        <circle cx={x} cy={y} r={7} className={shared} strokeWidth={1.25} />
      )}
    </g>
  );
});

/**
 * The four corners a piece can be resized by.
 *
 * Corners only, and that is a fix rather than a preference. `NodeResizer` also
 * lays an invisible resize LINE along every edge, so reaching for the edge of a
 * box to move it stretched it instead — which is how a camarote 160 wide by 90
 * deep ended up a tall narrow slot nobody asked for. The edges belong to the
 * drag; the corners resize.
 */
function Corners({
  visible,
  minWidth,
  minHeight,
  keepAspectRatio,
}: {
  visible: boolean;
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
}) {
  if (!visible) return null;
  return (
    <>
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          minWidth={minWidth}
          minHeight={minHeight}
          keepAspectRatio={keepAspectRatio}
          className="!size-2.5 !rounded-sm !border !border-card !bg-primary"
          style={{ borderWidth: 1.5 }}
        />
      ))}
    </>
  );
}

/**
 * Stock sold as a number: a pista, a camarote.
 *
 * Dashed, because the boundary is a decision rather than a measurement — a
 * standing floor holds whoever fits, and a solid edge would imply a precision
 * the sale does not have.
 *
 * It shows what it HOLDS, which an empty box did not. A camarote drawn as a
 * blank rectangle beside a block of chairs reads as a sector whose seats failed
 * to load, and that was the first thing anybody said about it. It has no seats
 * and never will — it is one unit admitting several people — so it draws the
 * people instead, and says it is sold whole.
 */
export function AreaNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<Node<PieceData, "area">>) {
  const t = useTranslations("layoutStudio");
  const clashing = React.useContext(ViewContext).collisions.has(id);
  const name = useName(data.draft);
  const capacity = Math.max(data.draft.capacity ?? 0, 0);
  const booth = data.draft.piece === "booth";

  return (
    <>
      <Corners visible={!!selected} minWidth={80} minHeight={64} />
      <div
        className={cn(
          "flex size-full flex-col overflow-hidden rounded-[10px] border-2 border-dashed",
          clashing
            ? "border-warning-ink bg-warning-subtle/40"
            : selected
              ? "border-primary bg-card ring-1 ring-primary/30"
              : "border-border-strong bg-muted/30 hover:border-foreground/30",
        )}
      >
        <Header
          name={name}
          amount={booth ? t("area.unit") : t("count.capacity", { capacity })}
          selected={!!selected}
        />
        {/* The people it holds, drawn. A blank rectangle beside a block of
            chairs reads as a sector whose seats failed to load, which was the
            first thing anybody said about it. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 px-2 py-1">
          <Occupancy
            capacity={capacity}
            crowd={!booth}
            width={(width ?? 180) - 24}
            height={(height ?? 116) - PAD_TOP - 22}
          />
          {booth ? (
            <span className="text-muted-foreground" style={{ fontSize: 10.5 }}>
              {t("count.capacity", { capacity })}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * The people an area holds, drawn.
 *
 * A camarote gets one mark per person, up to what fits: ten marks in a box is
 * the difference between "a unit for ten" and "an empty rectangle". A pista gets
 * a crowd — five hundred marks would be a grey smear, and the irregularity is
 * the whole point of the difference being shown.
 */
function Occupancy({
  capacity,
  crowd,
  width,
  height,
}: {
  capacity: number;
  crowd: boolean;
  width: number;
  height: number;
}) {
  const box = { width: Math.max(width, 24), height: Math.max(height, 12) };
  const pip = crowd ? 2.5 : 4;
  const gap = crowd ? 9 : 12;
  const columns = Math.max(Math.floor(box.width / gap), 1);
  const rows = Math.max(Math.floor(box.height / gap), 1);
  const room = columns * rows;
  const shown = crowd ? room : Math.min(capacity, room);
  if (shown <= 0) return null;

  const marks: React.ReactElement[] = [];
  for (let index = 0; index < shown; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    // A crowd is staggered and a seated unit is not: an even grid reads as
    // chairs, which is the one thing a standing floor does not have.
    const stagger = crowd && row % 2 === 1 ? gap / 2 : 0;
    marks.push(
      <circle
        key={index}
        cx={column * gap + gap / 2 + stagger}
        cy={row * gap + gap / 2}
        r={pip}
        className={crowd ? "fill-muted-foreground/45" : "fill-primary/70"}
      />,
    );
  }

  return (
    <svg
      width={columns * gap}
      height={rows * gap}
      viewBox={`0 0 ${columns * gap} ${rows * gap}`}
      className="pointer-events-none shrink-0"
      aria-hidden="true"
    >
      {marks}
    </svg>
  );
}

/**
 * Scenery: the stage, the floor a rodeo runs in.
 *
 * Solid and filled, because unlike an area it IS a measurement — a stage is a
 * physical object at a fixed place, and it is what a buyer orients the whole
 * map by.
 */
export function MarkerNode({
  id,
  data,
  selected,
  height,
}: NodeProps<Node<PieceData, "marker">>) {
  const clashing = React.useContext(ViewContext).collisions.has(id);
  const name = useName(data.draft);
  const round = data.draft.piece === "arena";
  return (
    <>
      <Corners
        visible={!!selected}
        minWidth={40}
        minHeight={round ? 40 : 20}
        // An arena is round: one handle-drag must not turn it into an ellipse
        // nobody asked for.
        keepAspectRatio={round}
      />
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden border-2 px-2 text-center",
          round ? "rounded-full" : "rounded-[10px]",
          clashing
            ? "border-warning-ink bg-warning-subtle"
            : selected
              ? "border-primary bg-primary/20"
              : "border-border-strong bg-muted hover:border-foreground/30",
        )}
      >
        <span
          className="max-w-full truncate font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ fontSize: Math.max(10, Math.min(16, (height ?? 40) / 3.2)) }}
        >
          {name}
        </span>
      </div>
    </>
  );
}

/** Which node type draws a given palette piece. */
export function nodeTypeFor(piece: Piece): "block" | "area" | "marker" {
  if (isMarker(piece)) return "marker";
  if (piece === "standing" || piece === "booth") return "area";
  return "block";
}
