"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { ArrowsInSimple, CircleNotch, Minus, Plus, Warning, X } from "@/components/icons";
import { Checkbox } from "@/components/elevated-design/elevated-checkbox";
import { Button } from "@/components/ui/button";
import {
  boundsOf,
  fetchBestAvailable,
  fetchSeatMap,
  isAccessibleKind,
  isSceneryKind,
  mergeSeatMap,
  bandColor,
  scaleFor,
  shapeOf,
  type Marker,
  type Seat,
  type SeatKind,
  type SeatShape,
} from "@/lib/seating/api";
import { cn } from "@/lib/utils";

/**
 * The buyer picking a chair.
 *
 * The use scene decides the whole shape of this. Somebody is on a phone, on
 * mobile data, competing with other people for the same seats, and the map they
 * are looking at is ADVISORY — nothing here reserves anything. Four
 * consequences, each of which is why a piece of this looks the way it does:
 *
 *  - SECTOR FIRST. Eighteen hundred chairs on a 390px screen is not a view, it
 *    is a texture. Pick a setor, then see that setor's rows at a size a thumb
 *    can hit. This is what Ingresso.com, Sympla and Ticketmaster all converge
 *    on, for the same reason.
 *
 *  - "MELHOR DISPONÍVEL" LEADS. Most people do not want to study a chart. The
 *    button is the default path and hand-picking is the alternative, which is
 *    also what gives somebody on a screen reader a real way to buy: a grid of
 *    chairs is an image, and "four together near the front" is a sentence.
 *
 *  - SHAPE, NOT ONLY COLOUR. Taken chairs are dimmed AND dashed; accessible
 *    ones are ROUND where ordinary ones are square, which is the same language
 *    the printed house maps use. A red/green seat map is the commonest
 *    colour-blindness pairing there is, and this interface is red/green by
 *    tradition, so nothing here is allowed to depend on hue alone.
 *
 *  - EVERY SEAT IS A REAL BUTTON, with a spoken name. Not a canvas with click
 *    handlers. For this feature that is not an oversight to fix later: a picker
 *    only reachable by sight excludes precisely the people the wheelchair
 *    spaces exist for.
 */

/** How often the map re-reads while somebody is looking at it. */
const POLL_MS = 3000;

export interface AreaTicketControl {
  title: string;
  price: string;
  quantity: number;
  canAdd: boolean;
}

export interface SeatPickerProps {
  eventId: string;
  /** Restrict to one tier, and name it, so the sector list can show prices. */
  sectors: {
    ticketId: string;
    title: string;
    priceCents: number;
    feeCents?: number;
  }[];
  currency: string;
  maxSeats: number;
  /** Called whenever the selection changes, so the buy panel can total it. */
  onChange: (seats: Seat[]) => void;
  selected: Seat[];
  /** Purchase details displayed alongside the map when there is room. */
  summary?: React.ReactNode;
  tickets?: React.ReactNode;
  /** Complete inventory identifies which tiers require a named seat. */
  onInventory?: (seats: Seat[], markers: Marker[]) => void;
  areaTickets?: Record<string, AreaTicketControl>;
  onAreaChange?: (ticketId: string, delta: number) => void;
  disabled?: boolean;
  /**
   * unavailable are the seats a claim just refused, by id.
   *
   * Passed in rather than discovered here because the claim happens in
   * checkout. It is what lets this grey exactly the chair that went and keep
   * the rest of the selection, which is the difference between a picker that
   * feels solid and one that feels broken.
   */
  unavailable?: string[];
}

export function SeatPicker({
  eventId,
  sectors,
  currency,
  maxSeats,
  onChange,
  selected,
  summary,
  tickets,
  onInventory,
  areaTickets,
  onAreaChange,
  disabled = false,
  unavailable = [],
}: SeatPickerProps) {
  const t = useTranslations("seating");

  const [seats, setSeats] = React.useState<Seat[] | null>(null);
  // The room's scenery: the stage, the floor a rodeo runs in. Arrives with the
  // complete map and never changes after.
  const [markers, setMarkers] = React.useState<Marker[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [wantAccessible, setWantAccessible] = React.useState(false);
  const [finding, setFinding] = React.useState(false);
  const [purchaseView, setPurchaseView] = React.useState<"seats" | "admission">("seats");

  // The cursor lives in a ref, not in state: advancing it must not re-render,
  // and the poll effect must not restart every time it moves.
  const cursor = React.useRef(0);

  React.useEffect(() => {
    let live = true;
    let timer = 0;

    const read = async () => {
      const delta = await fetchSeatMap(eventId, cursor.current);
      if (!live) return;
      if (!delta) {
        // Only the FIRST read failing is worth showing. A dropped poll on a
        // flaky connection is nothing: the map on screen is still the last
        // truth we had, and the claim is what decides anyway.
        setFailed((previous) => previous || cursor.current === 0);
      } else {
        if (delta.version > cursor.current) cursor.current = delta.version;
        setSeats((current) => mergeSeatMap(current ?? [], delta));
        if (delta.complete) onInventory?.(delta.seats, delta.markers ?? []);
        if (delta.markers && delta.markers.length > 0) setMarkers(delta.markers);
        setFailed(false);
      }
      if (live) timer = window.setTimeout(read, POLL_MS);
    };

    void read();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [eventId, onInventory]);

  const selectedIds = React.useMemo(() => new Set(selected.map((seat) => seat.id)), [selected]);
  const refusedIds = React.useMemo(() => new Set(unavailable), [unavailable]);

  /**
   * A colour per price band, which after binding is a colour per TIER.
   *
   * In the order the price list was given, so a band's colour does not move
   * when a sector sells out. Only when there is more than one: painting a
   * single-price house all one colour says nothing that the grey of a taken
   * seat does not already say better.
   */
  const tierColors = React.useMemo(() => {
    const colours: Record<string, string> = {};
    if (sectors.length < 2) return colours;
    sectors.forEach((sector, slot) => {
      colours[sector.ticketId] = bandColor(slot);
    });
    return colours;
  }, [sectors]);

  const priceOf = React.useCallback(
    (ticketId: string) => sectors.find((sector) => sector.ticketId === ticketId),
    [sectors],
  );

  const toggle = (seat: Seat) => {
    if (disabled) return;
    if (selectedIds.has(seat.id)) {
      onChange(selected.filter((chosen) => chosen.id !== seat.id));
      return;
    }
    if (seat.status !== "available" || refusedIds.has(seat.id)) return;
    if (selected.length >= maxSeats) return;
    onChange([...selected, seat]);
  };

  /**
   * Ask the server for the best run of adjacent seats.
   *
   * Across the WHOLE house, with no tier narrowing. It used to be scoped to the
   * sector the buyer had clicked, which made "four seats together" mean "four
   * together in the part of the room you happen to be looking at" — and the
   * answer a buyer wants is the best four in the building.
   */
  const findBest = async (quantity: number) => {
    setFinding(true);
    const found = await fetchBestAvailable(eventId, {
      quantity,
      accessible: wantAccessible,
    });
    setFinding(false);
    if (found.length > 0) onChange(found);
  };

  /**
   * What each part of the house costs, and how much of it is left.
   *
   * Grouped by TIER rather than by sector name, because the tier is what a
   * price band resolves to: two wings sharing a price are one line, and a
   * sector whose front rows cost more is two. Sector names would show the room
   * instead of the price list.
   */
  const bands = React.useMemo(() => {
    const byTier = new Map<string, { free: number; total: number }>();
    for (const seat of seats ?? []) {
      const tally = byTier.get(seat.ticketId) ?? { free: 0, total: 0 };
      tally.total += 1;
      if (seat.status === "available") tally.free += 1;
      byTier.set(seat.ticketId, tally);
    }
    return sectors
      .filter((sector) => byTier.has(sector.ticketId))
      .map((sector) => ({ ...sector, ...byTier.get(sector.ticketId)! }));
  }, [seats, sectors]);

  if (failed && seats === null) {
    return <p className="notice notice-fault notice-ink px-4 py-3 text-sm" role="alert">{t("loadFailed")}</p>;
  }

  if (seats === null) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  if (failed) {
    return (
      <p className="notice notice-fault notice-ink px-4 py-3 text-sm" role="alert">
        {t("loadFailed")}
      </p>
    );
  }

  return (
    <div>
      {tickets ? (
        <div className="seat-picker-mobile-switch mb-4 grid grid-cols-2 gap-2" role="group" aria-label={t("purchaseView.title")}>
          <Button type="button" className="min-h-11 whitespace-normal px-2 text-xs" variant={purchaseView === "seats" ? "primary" : "outline"}
            aria-pressed={purchaseView === "seats"} onClick={() => setPurchaseView("seats")}>
            {t("purchaseView.seats")}
          </Button>
          <Button type="button" className="min-h-11 whitespace-normal px-2 text-xs" variant={purchaseView === "admission" ? "primary" : "outline"}
            aria-pressed={purchaseView === "admission"} onClick={() => setPurchaseView("admission")}>
            {t("purchaseView.admission")}
          </Button>
        </div>
      ) : null}
    <div className="seat-picker-layout" data-view={tickets ? purchaseView : "seats"}>
      <div className="seat-picker-details min-w-0 space-y-4">
        <div className="seat-picker-seat-controls space-y-4">
        <details className="rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer rounded-sm font-display text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("best.title")}</summary>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("best.hint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: Math.min(maxSeats, 6) }, (_, index) => index + 1).map(
              (quantity) => (
                <Button
                  key={quantity}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={finding || disabled}
                  onClick={() => void findBest(quantity)}
                  className="tabular-nums"
                >
                  {t("best.seats", { count: quantity })}
                </Button>
              ),
            )}
          </div>
          <label
            htmlFor="seating-accessible"
            className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"
          >
            <Checkbox
              id="seating-accessible"
              checked={wantAccessible}
              onCheckedChange={(checked) => setWantAccessible(checked === true)}
              className="mt-0.5 shrink-0"
            />
            <span>
              {t("best.accessible")}
              {/* Said plainly, because an accessible seat withheld without
                explanation reads as a bug rather than as the law. */}
              <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
                {t("best.accessibleHint")}
              </span>
            </span>
          </label>
        </details>

        {bands.length > 0 ? (
          <ul className="grid gap-2">
            {bands.map((band) => (
              <li
                key={band.ticketId}
                className="rounded-[--radius] border border-border bg-card px-3 py-2"
              >
                {/* The name on its own line, whole. It shared a line with the
                  price and lost: `truncate` on the name and `shrink-0` on the
                  price rendered "B.. R$ 90,00" in a three column grid, keeping
                  the number and dropping the one word that says which part of
                  the house it belongs to. */}
                <span className="flex items-center gap-1.5">
                  {/* The swatch beside the name. Three of the palette's light
                    steps sit below 3:1 on a white ground and the validator
                    obliges a visible label for them, which this is. */}
                  {tierColors[band.ticketId] ? (
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tierColors[band.ticketId] }}
                    />
                  ) : null}
                  <span className="text-sm font-semibold leading-snug text-foreground">
                    {band.title}
                  </span>
                </span>
                <span className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatPrice(band.priceCents, currency)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {band.free > 0
                      ? t("sectors.available", { count: band.free })
                      : t("sectors.soldOut")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        </div>
        {tickets ? <div className="seat-picker-counted">{tickets}</div> : null}
        {summary}
      </div>

      <div className="seat-picker-map min-w-0">
        <HouseMap
          seats={seats}
          tierColors={tierColors}
          selectedIds={selectedIds}
          refusedIds={refusedIds}
          onToggle={toggle}
          currency={currency}
          priceOf={priceOf}
          full={selected.length >= maxSeats}
          markers={markers}
          areaTickets={areaTickets}
          onAreaChange={onAreaChange}
          disabled={disabled}
        />

      </div>
    </div>
    </div>
  );
}

/**
 * How a chair is sized: comfortable when the room allows it, small when the
 * room is big, never so small that a dot stops being a dot.
 *
 * This was one number, 26px, with the map scrolling rather than shrinking, on
 * the reasoning that 26px is the floor for a thumb. It is, and it was still the
 * wrong trade. A 222 seat house at a 32px pitch is about eight hundred pixels
 * wide and taller than that, so the buyer met a wall of numbered circles,
 * scrolled in two directions, and never saw the house had a balcony. Every
 * chair was tappable and the room was unreadable, which loses the one question
 * a seat map is opened to answer: where am I going to be sitting.
 *
 * So the house fits the frame and the chair size follows from the fit, down to
 * a 7px floor. Tapping is what the zoom is for: it multiplies the fitted scale
 * past the thumb floor and the frame pans. Read, then zoom, then tap.
 */
const SEAT_GAP_PX = 32;
const SEAT_MIN_PX = 7;
const SEAT_MAX_PX = 26;
/** Half a chair each side, plus the gutter the row letters hang in. */
const FRAME_PADDING_PX = 72;
/**
 * The gutter the row letters hang in, to the LEFT of the leftmost chair.
 *
 * They are drawn at the leftmost chair of each row and shifted a full width
 * left, so without a gutter the first block's letters land at a negative
 * offset and are clipped by the frame. It was marginal at a fixed 26px chair
 * and certain once the chair could be eleven.
 */
const ROW_LABEL_PX = 18;
/**
 * How far in the buyer can go, as a multiple of the fitted scale.
 *
 * 1 is always the whole house, because the room is laid out to fit and the
 * library scales that. The steps between are the library's to choose.
 */
const ZOOM_MAX = 6;

/**
 * The house: every sector at once, the scenery that says which way it faces,
 * and a letter beside every row.
 *
 * Drawn from COORDINATES rather than stacked as rows, which is what makes one
 * component work for every venue: a theatre and a rodeo's stands wrapped around
 * an arena are the same data, a set of chairs with positions. A component that
 * laid them out as a list of flex rows could only ever draw the theatre, and a
 * map that does not resemble the room cannot answer the one question it is
 * asked — where will I be sitting.
 */
function HouseMap({
  seats,
  tierColors,
  selectedIds,
  refusedIds,
  onToggle,
  currency,
  priceOf,
  full,
  markers,
  areaTickets,
  onAreaChange,
  disabled,
}: {
  seats: Seat[];
  /** The colour of each price band, keyed by the tier it sells at. */
  tierColors: Record<string, string>;
  selectedIds: Set<string>;
  refusedIds: Set<string>;
  onToggle: (seat: Seat) => void;
  currency: string;
  priceOf: (ticketId: string) => { priceCents: number } | undefined;
  full: boolean;
  markers: Marker[];
  areaTickets?: Record<string, AreaTicketControl>;
  onAreaChange?: (ticketId: string, delta: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("seating");

  // The box has to hold the scenery too. A stage sits in front of the first row
  // and an arena surrounds the stands, so bounds measured from chairs alone
  // clip exactly the thing a buyer is looking for.
  const bounds = React.useMemo(
    () =>
      boundsOf([
        ...seats,
        ...markers.flatMap((marker) => [
          { x: marker.x, y: marker.y },
          { x: marker.x + marker.width, y: marker.y + marker.height },
        ]),
      ]),
    [seats, markers],
  );

  // The comfortable scale, from the SEATS. It keeps two chairs from
  // overlapping, and letting a three-hundred-unit arena into that calculation
  // would shrink every chair to fit a shape nobody taps.
  const natural = React.useMemo(() => scaleFor(seats, SEAT_GAP_PX), [seats]);

  // The frame's size. Measured in both directions, because the frame's height
  // is fixed and the room has to fit inside it rather than stretch the card.
  // The observer delivers a first callback when it starts watching, so the
  // size arrives without reading layout during render or setting state from an
  // effect body.
  const frame = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const resizer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect;
      setBox({
        width: measured?.width ?? node.clientWidth,
        height: measured?.height ?? node.clientHeight,
      });
    });
    resizer.observe(node);
    return () => resizer.disconnect();
  }, []);

  /**
   * The scale the room is laid out at: the whole house inside the frame.
   *
   * Capped by `natural`, so a room of twelve chairs is not blown up to fill a
   * widescreen just because it would fit. Zoom is NOT part of this: the
   * library transforms what this lays out, which is the whole reason the room
   * is not re-measured on every zoom step.
   */
  const fitted =
    box.width > 0 && box.height > 0 && bounds.width > 0 && bounds.height > 0
      ? Math.min(
          natural,
          Math.max(box.width - FRAME_PADDING_PX, 160) / bounds.width,
          Math.max(box.height - FRAME_PADDING_PX, 120) / bounds.height,
        )
      : natural;

  // Where the library has got to. Tracked only to decide what is legible:
  // everything else about the zoom is the library's business.
  const [zoom, setZoom] = React.useState(1);

  // The chair follows the pitch, so chairs never touch and never drift apart.
  // By the definition of scaleFor, neighbours sit SEAT_GAP_PX/natural apart in
  // layout units, so this is that distance at the fitted scale.
  const pitch = natural > 0 ? (SEAT_GAP_PX / natural) * fitted : SEAT_GAP_PX;
  const seatPx = Math.min(SEAT_MAX_PX, Math.max(SEAT_MIN_PX, Math.round(pitch * 0.82)));

  // What a chair actually measures on screen, which is the laid out size times
  // whatever the library is scaling by. A number nobody can read is noise, and
  // a row letter nobody can read is worse because it widens the block. Both
  // return as the buyer zooms in, and the seat's accessible name carries them
  // at every size regardless, so this costs a screen reader nothing.
  const onScreen = seatPx * zoom;
  const showSeatLabels = onScreen >= 15;
  const showRowLabels = onScreen >= 11;

  // The left edge carries the row letters, so the origin shifts by their
  // gutter. Reserved whether or not they are drawn right now, because the
  // layout must not reflow when zooming brings them back.
  const padLeft = seatPx + ROW_LABEL_PX;
  const width = bounds.width * fitted + padLeft + seatPx;
  const height = bounds.height * fitted + seatPx * 2;

  /**
   * One letter per row, beside its leftmost chair.
   *
   * The map had none, and a buyer could count dots without ever reading that
   * they were about to buy Fila K — which is what the ticket, the usher and the
   * door all say. Placed from the chairs themselves, per sector, so a room of
   * three blocks gets three columns of letters and a ring of stands gets its
   * labels on the outside edge.
   */
  const rowLabels = React.useMemo(() => {
    const leftmost = new Map<string, Seat>();
    for (const seat of seats) {
      const key = `${seat.section}\u0000${seat.rowOrder}`;
      const held = leftmost.get(key);
      if (!held || seat.x < held.x) leftmost.set(key, seat);
    }
    return [...leftmost.values()];
  }, [seats]);

  const left = (x: number) => (x - bounds.minX) * fitted + padLeft;
  const top = (y: number) => (y - bounds.minY) * fitted + seatPx;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={ZOOM_MAX}
        centerOnInit
        // The room cannot be thrown off screen, which is the difference
        // between a map and a canvas.
        limitToBounds
        doubleClick={{ mode: "zoomIn", step: 0.7 }}
        wheel={{ step: 0.12 }}
        // A press that travels is a pan and a press that does not is a seat.
        // The library decides which, which is what the hand-rolled version
        // kept getting wrong.
        panning={{ velocityDisabled: false, excluded: ["area-ticket-control"] }}
        onTransform={(_reference, state: { scale: number }) => setZoom(state.scale)}
      >
        {({ zoomIn, zoomOut, resetTransform, zoomToElement }) => (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-muted-foreground">
                {zoom > 1.0001 ? t("zoom.panHint") : t("zoom.hint")}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("zoom.out")}
                  title={t("zoom.out")}
                  disabled={zoom <= 1.0001}
                  onClick={() => zoomOut()}
                >
                  <Minus aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("zoom.fit")}
                  title={t("zoom.fit")}
                  disabled={zoom <= 1.0001}
                  onClick={() => resetTransform()}
                >
                  <ArrowsInSimple aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("zoom.in")}
                  title={t("zoom.in")}
                  disabled={zoom >= ZOOM_MAX - 0.0001}
                  onClick={() => zoomIn()}
                >
                  <Plus aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>

            {/* A FIXED height, and the room fits inside it. The card used to
                grow with the room, which is how a theatre pushed its own
                legend off the bottom of the screen. */}
            <div
              ref={frame}
              className="relative h-[26rem] overflow-hidden rounded-sm sm:h-[34rem]"
            >
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
                wrapperClass="cursor-grab active:cursor-grabbing"
              >
                <div className="relative" style={{ width, height }}>
                  {/* What the organiser placed, where they placed it. Nothing
                      is derived and nothing is assumed: a room with no stage
                      draws none, and a rodeo with an arena AND a show stage
                      draws both. */}
                  {markers.map((marker) => {
                    const ticket = marker.ticketId ? areaTickets?.[marker.ticketId] : undefined;
                    const interactive = ticket && onAreaChange && !isSceneryKind(marker.kind);
                    const roomy = marker.width * fitted * zoom >= 150 && marker.height * fitted * zoom >= 100;
                    const markerId = `map-area-${marker.id}`;
                    return (
                      <div key={marker.id} id={markerId}
                        aria-hidden={interactive ? undefined : true}
                        className={cn(
                          "absolute grid place-items-center rounded-sm border border-border-strong",
                          marker.kind === "arena" && "rounded-full",
                          isSceneryKind(marker.kind) ? "bg-muted" : "border-dashed bg-background",
                          interactive && ticket.quantity > 0 && "border-solid border-blue-600 bg-blue-50 dark:bg-blue-950",
                        )}
                        style={{ left: left(marker.x), top: top(marker.y), width: Math.max(marker.width * fitted, seatPx), height: Math.max(marker.height * fitted, Math.round(seatPx * 0.7)) }}>
                        {interactive && roomy ? (
                          <div className="area-ticket-control grid justify-items-center gap-1 text-center"
                            style={{ transform: `scale(${1 / zoom})`, width: marker.width * fitted * zoom - 8 }}>
                            <span className="text-xs font-semibold text-foreground">{marker.name}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{ticket.price}</span>
                            <div className="flex items-center gap-1">
                              <Button type="button" variant="outline" className="area-ticket-control size-11 p-0"
                                disabled={disabled || ticket.quantity === 0} aria-label={t("area.remove", { area: marker.name })}
                                onClick={() => onAreaChange(marker.ticketId!, -1)}>
                                <Minus className="size-4" aria-hidden="true" />
                              </Button>
                              <span className="w-6 text-sm font-semibold tabular-nums" aria-live="polite">{ticket.quantity}</span>
                              <Button type="button" variant="outline" className="area-ticket-control size-11 p-0"
                                disabled={disabled || !ticket.canAdd} aria-label={t("area.add", { area: marker.name })}
                                onClick={() => onAreaChange(marker.ticketId!, 1)}>
                                <Plus className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        ) : interactive ? (
                          <button type="button" className="area-ticket-control grid h-full w-full content-center gap-1 px-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                            aria-label={t("area.zoom", { area: marker.name })}
                            onClick={() => zoomToElement(markerId, Math.min(ZOOM_MAX, Math.max(160 / (marker.width * fitted), 110 / (marker.height * fitted))))}>
                            <span className="text-[9px] font-semibold leading-tight">{marker.name}</span>
                            <span className="text-[9px]">{ticket.quantity > 0 ? ticket.quantity : "+"}</span>
                          </button>
                        ) : (
                          <span className="grid gap-0.5 px-1 text-center">
                            <span className="text-[0.625rem] font-semibold text-muted-foreground">{marker.name || t(marker.kind === "arena" ? "arena" : "stage")}</span>
                            {!isSceneryKind(marker.kind) && marker.capacity ? <span className="text-[0.625rem] tabular-nums text-muted-foreground">{t("areaHolds", { count: marker.capacity })}</span> : null}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* aria-hidden: every seat's own accessible name already says
                      its row, so a screen reader reading these would hear the
                      letter twice. They are there for the eye. */}
                  {showRowLabels
                    ? rowLabels.map((seat) => (
                        <span
                          key={`${seat.section}-${seat.rowOrder}`}
                          aria-hidden="true"
                          className="absolute grid w-4 -translate-x-full -translate-y-1/2 place-items-center pr-1 text-[0.625rem] font-medium tabular-nums text-muted-foreground"
                          style={{ left: left(seat.x) - seatPx / 2, top: top(seat.y) }}
                        >
                          {seat.row}
                        </span>
                      ))
                    : null}

                  {seats.map((seat) => (
                    <SeatButton
                      key={seat.id}
                      seat={seat}
                      band={tierColors[seat.ticketId]}
                      selected={selectedIds.has(seat.id)}
                      refused={refusedIds.has(seat.id)}
                      blocked={full && !selectedIds.has(seat.id)}
                      price={priceOf(seat.ticketId)?.priceCents}
                      currency={currency}
                      onToggle={onToggle}
                      size={seatPx}
                      showLabel={showSeatLabels}
                      style={{
                        position: "absolute",
                        left: left(seat.x),
                        top: top(seat.y),
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  ))}
                </div>
              </TransformComponent>
            </div>
          </>
        )}
      </TransformWrapper>

      {/* The kinds THIS room has, under the map that has them.
          A Brazilian house map carries this by convention — "cadeira para
          obesos", "mobilidade reduzida" — and a buyer who needs one has to be
          able to find it. Only the kinds present, because a legend advertising
          seats a room does not have sends somebody looking for them. */}
      <KindLegend seats={seats} />
      <div className="mt-4 border-t border-border pt-4"><Legend /></div>
    </div>
  );
}


/** The accessible kinds present in a room, with the glyph each one draws as. */
function KindLegend({ seats }: { seats: Seat[] }) {
  const t = useTranslations("seating");
  const kinds = React.useMemo(() => {
    const seen = new Set<SeatKind>();
    for (const seat of seats) {
      if (seat.kind !== "standard") seen.add(seat.kind);
    }
    return [...seen];
  }, [seats]);

  if (kinds.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
      {kinds.map((kind) => (
        <li
          key={kind}
          // The kind names are written lower case because their first job is
          // being read aloud inside a seat's accessible name — "Fila K,
          // Assento 12, cadeira para obesos". A legend wants a capital, and
          // CSS is the right place to ask for one rather than a second copy of
          // six strings in four languages.
          className="flex items-center gap-1.5 text-xs text-muted-foreground first-letter:uppercase"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 border border-border-strong bg-muted",
              shapeClass(shapeOf(kind)),
            )}
          />
          {t(`kind.${kind}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The CSS for one seat shape.
 *
 * The shape comes from `shapeOf`, which the organiser's builder reads too, so
 * this is only how it is spelled in Tailwind. A ring gets its hole from an
 * inset shadow rather than a child element, so the glyph stays one node.
 */
function shapeClass(shape: SeatShape): string {
  switch (shape) {
    case "square":
      return "rounded-[3px]";
    case "outlined":
      return "rounded-[3px] !bg-background";
    case "ring":
      return "rounded-full shadow-[inset_0_0_0_3px_hsl(var(--card))]";
    case "wide":
      // Width comes from the chair's own `box`, scaled with the map. A fixed
      // !w-5 here would keep a 20px chair on a house drawn at eight.
      return "rounded-full";
    default:
      return "rounded-full";
  }
}

function SeatButton({
  seat,
  band,
  selected,
  refused,
  blocked,
  price,
  currency,
  onToggle,
  size,
  showLabel,
  style,
}: {
  seat: Seat;
  /** This seat's price band, when the house sells at more than one price. */
  band?: string;
  selected: boolean;
  refused: boolean;
  blocked: boolean;
  price?: number;
  currency: string;
  onToggle: (seat: Seat) => void;
  /** The chair's size in pixels, from the scale the house was fitted at. */
  size: number;
  /**
   * Whether the seat number is drawn inside the chair.
   *
   * False on a fitted house, where the chair is a few pixels across and a
   * number in it would be a smudge. It costs nothing: the number is in the
   * accessible name and in the tooltip at every size, so the buyer can still
   * read it by hovering and a screen reader never notices.
   */
  showLabel: boolean;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("seating");
  const taken = seat.status !== "available" || refused;
  const accessible = isAccessibleKind(seat.kind);
  const shape = shapeOf(seat.kind);
  // The band paints a FREE seat and nothing else: a taken one is grey and a
  // chosen one is the accent, so the colour on screen always answers "can I
  // have this, and what does it cost" in that order.
  const paint = band && !taken && !selected ? { backgroundColor: band } : undefined;
  // Sized from the prop rather than from a class, because the scale is only
  // known at render. The proportions are the ones the fixed 26px chair had, so
  // a wide chair stays the same fraction narrower than a round one.
  const box: React.CSSProperties = {
    width: shape === "wide" ? Math.round(size * (20 / 26)) : size,
    height: size,
    // Small enough to sit inside the chair, never below the point where a
    // digit turns into a pixel.
    fontSize: Math.max(8, Math.round(size * 0.42)),
  };

  // The accessible name is the whole seat, spoken the way an usher says it.
  // This is the non-visual path, and it has to carry everything the colour and
  // the shape carry for somebody who can see them.
  const status = refused
    ? t("status.taken")
    : seat.status === "available"
      ? t("status.available")
      : seat.status === "blocked"
        ? t("status.blocked")
        : t("status.taken");
  const label = [
    t("seatName", { row: seat.row, seat: seat.seat }),
    accessible ? t(`kind.${seat.kind}`) : null,
    price !== undefined ? formatPrice(price, currency) : null,
    status,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={() => onToggle(seat)}
      disabled={taken || (blocked && !selected)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      style={{ ...style, ...box, ...paint }}
      className={cn(
        // Size comes from the fitted scale, in `box` above. A fitted house
        // draws small chairs on purpose and the zoom is what makes them
        // tappable.
        "grid shrink-0 place-items-center border font-semibold tabular-nums transition-colors",
        // SHAPE is the kind, from the same table the organiser's builder reads,
        // so a chair marked there is the same glyph here.
        shapeClass(shape),
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        // COLOUR is availability, which is the one thing a buyer scans a map
        // for. Free is green, gone is grey, chosen is the accent.
        selected && "border-blue-700 bg-blue-600 text-white ring-2 ring-blue-600/30 ring-offset-1",
        !selected &&
          !taken &&
          // The green is the single-price case, where there is no band to carry
          // and "free" is the only thing colour has to say.
          (band
            ? "border-border-strong text-white hover:border-primary"
            : "border-healthy-edge bg-healthy text-healthy-foreground hover:border-primary hover:bg-primary-subtle hover:text-primary-ink"),
        // Taken seats are dimmed AND flat AND not focusable. Colour alone
        // cannot carry this: green/grey is legible to most people and this has
        // to work for the rest.
        taken && "cursor-not-allowed border-border bg-muted text-muted-foreground",
        blocked && !selected && !taken && "cursor-not-allowed opacity-50",
      )}
    >
      {selected ? <span aria-hidden="true">✓</span> : showLabel ? <span aria-hidden="true">{seat.seat}</span> : null}
    </button>
  );
}

/**
 * The legend, which is not decoration.
 *
 * A Brazilian house map carries one by law-adjacent convention — "cadeira para
 * obesos", "mobilidade reduzida" — and a buyer who needs one of those seats has
 * to be able to find it.
 */
function Legend() {
  const t = useTranslations("seating");
  // The three STATES, in the order a buyer meets them. The kinds have their own
  // legend under the map, beside the chairs they describe.
  const items: { key: string; node: React.ReactNode }[] = [
    {
      key: "available",
      node: <span className="size-3.5 rounded-full border border-healthy-edge bg-healthy" />,
    },
    {
      key: "selected",
      node: <span className="grid size-3.5 place-items-center rounded-full bg-blue-600 text-[10px] text-white">✓</span>,
    },
    {
      key: "taken",
      node: <span className="size-3.5 rounded-full border border-border bg-muted" />,
    },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.node}
          {t(`legend.${item.key}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The chosen seats, listed.
 *
 * Separate from the map because it is what the buyer checks before paying, and
 * because on a phone the map is scrolled away by then. It is also the only
 * confirmation a screen-reader user gets that "melhor disponível" chose what
 * they wanted.
 */
export function SeatSelection({
  seats,
  onRemove,
}: {
  seats: Seat[];
  onRemove: (seat: Seat) => void;
}) {
  const t = useTranslations("seating");
  if (seats.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("selection.empty")}</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label={t("selection.title")}>
      {seats.map((seat) => (
        <li
          key={seat.id}
          className="flex items-center justify-between gap-3 rounded-[--radius] border border-border bg-card px-3 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-3 shrink-0 border border-border-strong bg-background",
                isAccessibleKind(seat.kind) ? "rounded-full" : "rounded-[3px]",
              )}
            />
            <span className="min-w-0 truncate text-sm text-foreground">
              {seat.section} · {t("seatName", { row: seat.row, seat: seat.seat })}
              {isAccessibleKind(seat.kind) ? (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t(`kind.${seat.kind}`)}
                </span>
              ) : null}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(seat)}
            aria-label={t("selection.remove", {
              row: seat.row,
              seat: seat.seat,
            })}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A refusal, named. */
export function SeatsRefused({ seats }: { seats: Seat[] }) {
  const t = useTranslations("seating");
  if (seats.length === 0) return null;
  return (
    <p className="notice notice-warning notice-ink px-3 py-2 text-sm" role="alert">
      <Warning className="mr-1.5 inline size-4 align-text-bottom" aria-hidden="true" />
      {t("refused", {
        seats: seats.map((seat) => `${seat.row}${seat.seat}`).join(", "),
        count: seats.length,
      })}
    </p>
  );
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}
