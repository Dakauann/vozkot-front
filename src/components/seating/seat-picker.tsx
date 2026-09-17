"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { CircleNotch, Warning, X } from "@/components/icons";
import { Checkbox } from "@/components/elevated-design/elevated-checkbox";
import { Button } from "@/components/ui/button";
import {
  boundsOf,
  fetchBestAvailable,
  fetchSeatMap,
  isAccessibleKind,
  mergeSeatMap,
  scaleFor,
  sectionsOf,
  type Marker,
  type Seat,
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

export interface SeatPickerProps {
  eventId: string;
  /** Restrict to one tier, and name it, so the sector list can show prices. */
  sectors: { ticketId: string; title: string; priceCents: number; feeCents?: number }[];
  currency: string;
  maxSeats: number;
  /** Called whenever the selection changes, so the buy panel can total it. */
  onChange: (seats: Seat[]) => void;
  selected: Seat[];
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
  unavailable = [],
}: SeatPickerProps) {
  const t = useTranslations("seating");

  const [seats, setSeats] = React.useState<Seat[] | null>(null);
  // The room's scenery: the stage, the floor a rodeo runs in. Arrives with the
  // complete map and never changes after.
  const [markers, setMarkers] = React.useState<Marker[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [section, setSection] = React.useState<string | null>(null);
  const [wantAccessible, setWantAccessible] = React.useState(false);
  const [finding, setFinding] = React.useState(false);

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
  }, [eventId]);

  const sections = React.useMemo(() => sectionsOf(seats ?? []), [seats]);
  // One sector means there is no choice to make, so it is made.
  const activeSection = section ?? (sections.length === 1 ? sections[0] : null);

  const selectedIds = React.useMemo(
    () => new Set(selected.map((seat) => seat.id)),
    [selected],
  );
  const refusedIds = React.useMemo(() => new Set(unavailable), [unavailable]);

  const priceOf = React.useCallback(
    (ticketId: string) => sectors.find((sector) => sector.ticketId === ticketId),
    [sectors],
  );

  const toggle = (seat: Seat) => {
    if (selectedIds.has(seat.id)) {
      onChange(selected.filter((chosen) => chosen.id !== seat.id));
      return;
    }
    if (seat.status !== "available" || refusedIds.has(seat.id)) return;
    if (selected.length >= maxSeats) return;
    onChange([...selected, seat]);
  };

  const findBest = async (quantity: number) => {
    setFinding(true);
    const found = await fetchBestAvailable(eventId, {
      ticketId: activeSection
        ? (seats ?? []).find((seat) => seat.section === activeSection)?.ticketId
        : undefined,
      quantity,
      accessible: wantAccessible,
    });
    setFinding(false);
    if (found.length > 0) {
      onChange(found);
      setSection(found[0].section);
    }
  };

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
    <div className="space-y-4">
      {/* The primary path. It sits above the map on purpose: most buyers never
          need to look at the chart, and the ones who do can scroll past a
          button. */}
      <div className="rounded-[--radius] border border-border bg-card p-4">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {t("best.title")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("best.hint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: Math.min(maxSeats, 6) }, (_, index) => index + 1).map(
            (quantity) => (
              <Button
                key={quantity}
                type="button"
                variant="outline"
                size="sm"
                disabled={finding}
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
      </div>

      {/* Sector first. */}
      {sections.length > 1 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">
            {t("sectors.title")}
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {sections.map((name) => {
              const inSection = seats.filter((seat) => seat.section === name);
              const free = inSection.filter((seat) => seat.status === "available").length;
              const sector = priceOf(inSection[0]?.ticketId ?? "");
              const current = activeSection === name;
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setSection(name)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "w-full rounded-[--radius] border px-3 py-2.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      current
                        ? "border-primary bg-primary-subtle"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {name}
                      </span>
                      {sector ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {formatPrice(sector.priceCents, currency)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                      {free > 0 ? t("sectors.available", { count: free }) : t("sectors.soldOut")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeSection ? (
        <SectionMap
          seats={seats.filter((seat) => seat.section === activeSection)}
          selectedIds={selectedIds}
          refusedIds={refusedIds}
          onToggle={toggle}
          currency={currency}
          priceOf={priceOf}
          full={selected.length >= maxSeats}
          markers={markers}
        />
      ) : (
        <p className="py-4 text-sm text-muted-foreground">{t("sectors.choose")}</p>
      )}

      <Legend />
    </div>
  );
}

/**
 * One sector's chairs, and the scenery that says which way the room faces.
 */
/** The tap target, and the spacing the map is scaled to hold. */
const SEAT_PX = 26;
const SEAT_GAP_PX = 32;

function SectionMap({
  seats,
  selectedIds,
  refusedIds,
  onToggle,
  currency,
  priceOf,
  full,
  markers,
}: {
  seats: Seat[];
  selectedIds: Set<string>;
  refusedIds: Set<string>;
  onToggle: (seat: Seat) => void;
  currency: string;
  priceOf: (ticketId: string) => { priceCents: number } | undefined;
  full: boolean;
  markers: Marker[];
}) {
  const t = useTranslations("seating");

  // Drawn from COORDINATES, not stacked as rows.
  //
  // This is what makes one picker work for every venue. A theatre and a rodeo
  // stand wrapped around an arena are the same data, a set of seats with
  // positions, and a component that laid them out as a list of flex rows could
  // only ever draw the theatre. A map that does not resemble the room cannot
  // answer the one question it is asked, which is where a person will sit.
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
  // Scaled from the SEATS. The scale exists to keep two chairs from overlapping,
  // and letting a three-hundred-unit arena into that calculation would shrink
  // every chair to fit a shape nobody taps.
  const scale = React.useMemo(() => scaleFor(seats, SEAT_GAP_PX), [seats]);
  const width = bounds.width * scale + SEAT_PX * 2;
  const height = bounds.height * scale + SEAT_PX * 2;

  return (
    <div className="rounded-[--radius] border border-border bg-card p-3 sm:p-4">
      {/* Scrolled rather than shrunk. 26px is already the floor for a thumb,
          and a map that fits by making chairs eight pixels wide fits nothing a
          person can actually tap. */}
      <div className="-mx-1 overflow-auto px-1 pb-1">
        <div
          className="relative mx-auto"
          style={{ width: Math.max(width, 240), height: Math.max(height, 140) }}
        >
          {/* What the organiser placed, where they placed it. Nothing is
              derived and nothing is assumed: a room with no stage draws none,
              and a rodeo with an arena AND a show stage draws both. */}
          {markers.map((marker) => (
            <div
              key={marker.id}
              aria-hidden="true"
              className={cn(
                "absolute grid place-items-center overflow-hidden border border-border-strong bg-muted px-1",
                marker.kind === "arena" ? "rounded-full" : "rounded-sm",
              )}
              style={{
                left: (marker.x - bounds.minX) * scale + SEAT_PX,
                top: (marker.y - bounds.minY) * scale + SEAT_PX,
                width: Math.max(marker.width * scale, 24),
                height: Math.max(marker.height * scale, 16),
              }}
            >
              <span className="truncate text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {marker.name || t(marker.kind === "arena" ? "arena" : "stage")}
              </span>
            </div>
          ))}

          {seats.map((seat) => (
            <SeatButton
              key={seat.id}
              seat={seat}
              selected={selectedIds.has(seat.id)}
              refused={refusedIds.has(seat.id)}
              blocked={full && !selectedIds.has(seat.id)}
              price={priceOf(seat.ticketId)?.priceCents}
              currency={currency}
              onToggle={onToggle}
              style={{
                position: "absolute",
                left: (seat.x - bounds.minX) * scale + SEAT_PX,
                top: (seat.y - bounds.minY) * scale + SEAT_PX,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SeatButton({
  seat,
  selected,
  refused,
  blocked,
  price,
  currency,
  onToggle,
  style,
}: {
  seat: Seat;
  selected: boolean;
  refused: boolean;
  blocked: boolean;
  price?: number;
  currency: string;
  onToggle: (seat: Seat) => void;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("seating");
  const taken = seat.status !== "available" || refused;
  const accessible = isAccessibleKind(seat.kind);

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
      style={style}
      className={cn(
        // 26px at rest, which is the floor for a thumb; the map scrolls rather
        // than shrinking below it.
        "grid size-[26px] shrink-0 place-items-center border text-[0.625rem] font-semibold tabular-nums transition-colors",
        // SHAPE carries the kind, not an icon and not colour alone. A round
        // seat is an accessible one, a square seat is ordinary — which is the
        // same language the printed house maps use, and the only one that
        // survives both a colour-blind reader and a monochrome print.
        accessible ? "rounded-full" : "rounded-[5px]",
        accessible && !selected && !taken && "ring-1 ring-inset ring-primary-ink/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        selected && "border-primary bg-primary text-primary-foreground",
        !selected && !taken && "border-border-strong bg-background text-foreground hover:border-primary hover:bg-primary-subtle",
        // Taken seats are dimmed AND hollow AND not focusable. Colour alone
        // cannot carry this: red/green is the commonest colour-blindness
        // pairing and this is a red/green interface by convention.
        taken && "cursor-not-allowed border-dashed border-border bg-muted text-muted-foreground opacity-60",
        blocked && !selected && !taken && "cursor-not-allowed opacity-50",
      )}
    >
      <span aria-hidden="true">{seat.seat}</span>
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
  const items: { key: string; node: React.ReactNode }[] = [
    {
      key: "available",
      node: <span className="size-3.5 rounded-[4px] border border-border-strong bg-background" />,
    },
    { key: "selected", node: <span className="size-3.5 rounded-[4px] bg-primary" /> },
    {
      key: "taken",
      node: <span className="size-3.5 rounded-[4px] border border-dashed border-border bg-muted" />,
    },
    {
      key: "accessible",
      node: (
        <span className="size-3.5 rounded-full border border-border-strong bg-background ring-1 ring-inset ring-primary-ink/40" />
      ),
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
            aria-label={t("selection.remove", { row: seat.row, seat: seat.seat })}
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
