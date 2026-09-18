"use client";

import { apiFetch } from "@/lib/api/client";

/**
 * Reserved seating: the map a buyer picks from, and the room an organiser draws.
 *
 * The one thing to understand before reading anything else: **the map is
 * advisory and the claim is authoritative.** Nothing here reserves a seat.
 * Selecting a chair on screen is a local decision that costs nothing and
 * promises nothing; the seat becomes yours when checkout claims it, and that
 * can fail because somebody two seats ahead of you in the queue was faster.
 *
 * Every reserved-seating system works this way, because the alternative,
 * holding a seat because a cursor touched it, turns every abandoned tab into
 * withheld inventory during exactly the minutes when inventory matters.
 *
 * So the picker's job is to be nearly right and to fail gracefully. It polls a
 * delta rather than the whole house, it paints what it last heard, and when a
 * claim comes back refused it greys the one chair that went and keeps the rest
 * of the selection intact.
 */

/** Where one seat of one event stands. */
export type SeatStatus = "available" | "held" | "sold" | "blocked";

/**
 * What kind of chair this physically is.
 *
 * The accessible kinds are not decoration. Decreto 5.296/2004 art. 23 requires
 * a Brazilian house to reserve wheelchair spaces and seats for reduced
 * mobility, half of the latter built for obese persons, which is exactly the
 * legend on any Brazilian seat map. They are never offered to a buyer who did
 * not ask for one, and the server enforces that; this type is what lets the map
 * draw them differently.
 */
export type SeatKind =
  "standard" | "wheelchair" | "companion" | "reduced_mobility" | "obese" | "restricted_view";

const ACCESSIBLE_KINDS: ReadonlySet<SeatKind> = new Set<SeatKind>([
  "wheelchair",
  "companion",
  "reduced_mobility",
  "obese",
]);

export function isAccessibleKind(kind: SeatKind): boolean {
  return ACCESSIBLE_KINDS.has(kind);
}

/**
/**
 * How many price bands get a hue of their own.
 *
 * Eight, from a validated categorical palette, assigned in a FIXED order and
 * never cycled. A ninth band takes the neutral rather than a generated hue: a
 * made-up ninth colour is the one nobody can name, and two bands sharing a hue
 * is worse than one band having none.
 */
export const BAND_SLOTS = 8;

/**
 * The colour of one price band, by its slot.
 *
 * A CSS variable rather than a hex literal, because the palette has a light and
 * a dark step for every hue and the theme has to be able to swap them. The
 * values live in globals.css beside the rest of the theme, with the validator's
 * verdict against this project's own surfaces written above them.
 *
 * The slot comes from the SERVER, which orders a room's bands by first
 * appearance so the order, and therefore the colour, is stable. Working it out
 * here would be a second answer to "what colour is Plateia".
 */
export function bandColor(slot: number): string {
  if (slot < 0 || slot >= BAND_SLOTS) return "hsl(var(--muted-foreground))";
  return `var(--band-${slot + 1})`;
}

export type SeatShape = "circle" | "square" | "outlined" | "ring" | "wide";

/**
 * How a seat's kind is DRAWN: a shape, never a colour and never an icon.
 *
 * One table, read by the organiser's builder and the buyer's map, so a chair
 * marked in one is the same glyph in the other. That is not tidiness: an
 * organiser marks a wheelchair space and then has to recognise it on the page a
 * buyer sees, and two vocabularies for one fact is how a room gets marked wrong.
 *
 * Shape and not colour because colour is already spoken for: the price band
 * paints a free chair and availability decides whether it is painted at all, so
 * hue is fully committed before kind gets a turn. It is also the accessible
 * choice, since a legend that distinguishes "mobilidade reduzida" from "cadeira
 * para obesos" by hue alone fails exactly the people reading it for themselves.
 */
export function shapeOf(kind: SeatKind): SeatShape {
  switch (kind) {
    // A wheelchair SPACE has no chair in it, and its companion seat is the pair
    // the law requires, so the two read as one unit.
    case "wheelchair":
      return "square";
    case "companion":
      return "outlined";
    case "reduced_mobility":
      return "ring";
    // Wider, because that is literally what the seat is.
    case "obese":
      return "wide";
    default:
      return "circle";
  }
}

/**
 * One chair, as the picker sees it.
 *
 * Note what is absent: who holds it, and until when. The server does not send
 * either, on purpose: a map that published them would tell every visitor which
 * account to race and exactly when to try.
 */
export interface Seat {
  id: string;
  ticketId: string;
  section: string;
  row: string;
  seat: string;
  kind: SeatKind;
  status: SeatStatus;
  /**
   * rowOrder and seatOrder are the ONLY definition of adjacency.
   *
   * Never the labels. An older theatre numbers seats outward from the centre
   * aisle, so 5 and 7 are neighbours and 5 and 6 are not, and a picker that
   * reasoned from the printed number would refuse to seat a couple together.
   */
  rowOrder: number;
  seatOrder: number;
  /**
   * Where the seat IS, in the layout's coordinate space.
   *
   * The map draws from these rather than stacking rows in a list, which is what
   * lets one picker render a theatre, a rodeo's stands wrapped around an arena
   * and a floor of round tables. Unitless: the client derives a scale from the
   * closest pair of seats and fits the whole room to it.
   */
  x: number;
  y: number;
}

/**
 * A block of the room that holds no individual chairs.
 *
 * "Where is the stage" is the first question anybody asks of a seat map, and it
 * cannot be derived from the chairs. It used to be a three-valued `focus` on the
 * layout, from which the client drew a bar across the top or a disc in the
 * middle, which put the stage in exactly one place, gave nobody a way to move
 * it, and could not describe a rodeo with a show stage at one end. A marker is
 * placed and sized by the organiser, like everything else in the room.
 *
 * Scenery (`stage`, `arena`) and counted floor (`standing`, `booth`) both, so
 * that a map drawn from seats plus markers draws the WHOLE room. Leaving the
 * counted sections out left holes: a standing pista between the stage and the
 * chairs read as an unexplained gap, and side boxes fell outside the bounding
 * box altogether.
 */
export interface Marker {
  /** Explicit event binding; absent for scenery or an unconfigured area. */
  ticketId?: string;
  id: string;
  name: string;
  kind: "stage" | "arena" | "standing" | "booth";
  /** How many people it holds. Only the counted kinds have one. */
  capacity?: number;
  /** The marker's CENTRE, in the same coordinate space as the seats. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SeatMap {
  seats: Seat[];
  /**
   * The room's scenery. Sent with a complete map and absent from a delta,
   * because a stage does not move between two polls.
   */
  markers?: Marker[];
  /** The cursor to send back as `since` on the next poll. */
  version: number;
  /** Whether this is the whole map or only what changed. */
  complete: boolean;
}

export interface SectorAvailability {
  ticketId: string;
  available: number;
  total: number;
}

interface MapEnvelope {
  data: Seat[];
  markers?: Marker[];
  version: number;
  complete: boolean;
}

/**
 * Read an event's map, or only what changed since a cursor.
 *
 * `since` of 0 asks for the whole house. Anything higher returns a delta, which
 * is what makes polling a busy onsale cost an indexed range scan instead of
 * four thousand rows every two seconds.
 */
export async function fetchSeatMap(eventId: string, since = 0): Promise<SeatMap | null> {
  const query = since > 0 ? `?since=${since}` : "";
  const { data } = await apiFetch<MapEnvelope>(`/api/v1/events/${eventId}/seating/map${query}`);
  if (!data) return null;
  return {
    seats: data.data ?? [],
    markers: data.markers ?? [],
    version: data.version ?? 0,
    complete: data.complete ?? false,
  };
}

export async function fetchAvailability(eventId: string): Promise<SectorAvailability[]> {
  const { data } = await apiFetch<{ data: SectorAvailability[] }>(
    `/api/v1/events/${eventId}/seating/availability`,
  );
  return data?.data ?? [];
}

/**
 * Ask the server for the best run of adjacent seats.
 *
 * The primary path, not a shortcut. Most buyers do not want to study a chart;
 * they want four together, near the front, now. It is also what gives somebody
 * using a screen reader a real way to buy, since a chart of chairs is an image
 * and "four seats together" is a sentence.
 *
 * Returns an empty array rather than splitting a party across rows.
 */
export async function fetchBestAvailable(
  eventId: string,
  options: { ticketId?: string; quantity: number; accessible?: boolean },
): Promise<Seat[]> {
  const params = new URLSearchParams({ quantity: String(options.quantity) });
  if (options.ticketId) params.set("ticketId", options.ticketId);
  if (options.accessible) params.set("accessible", "true");
  const { data } = await apiFetch<MapEnvelope>(
    `/api/v1/events/${eventId}/seating/best?${params.toString()}`,
  );
  return data?.data ?? [];
}

/** Whether this event sells named seats at all. */
export async function hasSeatMap(eventId: string): Promise<boolean> {
  const map = await fetchSeatMap(eventId, 0);
  return (map?.seats.length ?? 0) > 0;
}

/**
 * Merge a delta into a map already on screen.
 *
 * Kept here rather than in the component because it is the one piece of
 * reasoning the picker cannot get wrong without the map lying: a delta REPLACES
 * the seats it names and leaves every other seat alone, and a `complete`
 * response replaces everything. Getting that backwards makes a chair somebody
 * just took look free.
 */
export function mergeSeatMap(current: Seat[], delta: SeatMap): Seat[] {
  if (delta.complete) return delta.seats;
  if (delta.seats.length === 0) return current;
  const changed = new Map(delta.seats.map((seat) => [seat.id, seat]));
  const merged = current.map((seat) => changed.get(seat.id) ?? seat);
  // A delta can name a seat this client has never seen, if it joined mid-onsale
  // against a stale cursor. Appending is correct and cheap; dropping it would
  // leave a hole in the map.
  for (const [id, seat] of changed) {
    if (!current.some((existing) => existing.id === id)) merged.push(seat);
  }
  return merged;
}

/** Group seats into rows, in the order a row is read. */
export function rowsOf(seats: Seat[]): { row: string; seats: Seat[] }[] {
  const byRow = new Map<string, Seat[]>();
  for (const seat of seats) {
    const existing = byRow.get(seat.row);
    if (existing) existing.push(seat);
    else byRow.set(seat.row, [seat]);
  }
  return [...byRow.entries()]
    .map(([row, rowSeats]) => ({
      row,
      seats: [...rowSeats].sort((a, b) => a.seatOrder - b.seatOrder),
    }))
    .sort((a, b) => (a.seats[0]?.rowOrder ?? 0) - (b.seats[0]?.rowOrder ?? 0));
}

/**
 * The pixel scale that keeps a map's seats from overlapping.
 *
 * A seat map is drawn from layout coordinates, whose units are arbitrary: a
 * theatre generated at a 24-unit seat gap and an arena generated at a radius of
 * 180 are the same room to the generator and wildly different numbers here.
 * Rendering either at a fixed scale would either overlap every chair or spread
 * twelve of them across a metre of screen.
 *
 * So the scale comes from the room itself: find the closest pair of seats, and
 * make that distance the target spacing. Everything else follows.
 */
export function scaleFor(seats: { x: number; y: number }[], targetGapPx: number): number {
  if (seats.length < 2) return 1;
  let closest = Infinity;
  // Against each seat's nearest neighbour IN ITS OWN ROW, which is what the eye
  // reads as spacing. Comparing every pair would be O(n²) on a stadium and
  // would also find the gap between two rows, which is not the constraint.
  const byRow = new Map<number, { x: number; y: number }[]>();
  for (const seat of seats) {
    const key = Math.round((seat as { rowOrder?: number }).rowOrder ?? 0);
    const existing = byRow.get(key);
    if (existing) existing.push(seat);
    else byRow.set(key, [seat]);
  }
  for (const row of byRow.values()) {
    for (let index = 1; index < row.length; index += 1) {
      const gap = Math.hypot(row[index].x - row[index - 1].x, row[index].y - row[index - 1].y);
      if (gap > 0.01 && gap < closest) closest = gap;
    }
  }
  if (!Number.isFinite(closest) || closest <= 0) return 1;
  return targetGapPx / closest;
}

/** The bounding box of a set of seats, in layout units. */
export function boundsOf(seats: { x: number; y: number }[]) {
  if (seats.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seat of seats) {
    if (seat.x < minX) minX = seat.x;
    if (seat.y < minY) minY = seat.y;
    if (seat.x > maxX) maxX = seat.x;
    if (seat.y > maxY) maxY = seat.y;
  }
  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

/** The distinct sections of a map, in the order they should be offered. */
export function sectionsOf(seats: Seat[]): string[] {
  const seen: string[] = [];
  for (const seat of seats) {
    if (!seen.includes(seat.section)) seen.push(seat.section);
  }
  return seen;
}

// --- the organiser's editor -------------------------------------------------

/**
 * How a block of the room is sold, or, for the last two, that it is not sold
 * at all. `stage` and `arena` hold no seats: they are scenery, placed and sized
 * like anything else, which is why they are sections rather than a mode on the
 * layout.
 */
export type SectionKind = "seated" | "standing" | "booth" | "stage" | "arena";

/** Scenery rather than inventory: drawn, never sold. */
export function isMarkerKind(kind: SectionKind): boolean {
  return kind !== "seated";
}

/**
 * Whether a block is scenery rather than somewhere a buyer can be.
 *
 * The distinction a map draws: scenery is a quiet neutral that orients the
 * room, counted floor is somewhere you can buy your way onto and is drawn to
 * say so.
 */
export function isSceneryKind(kind: Marker["kind"] | SectionKind): boolean {
  return kind === "stage" || kind === "arena";
}
export type Numbering = "sequential" | "odd_even";
/** How the rows run: along a line, or as arcs around a centre. */
export type RowShape = "linear" | "arc";
export type RowLabelStyle = "letters" | "numbers";

export interface Venue {
  id: string;
  name: string;
  capacity: number;
}

export interface Layout {
  id: string;
  venueId: string;
  name: string;
  version: number;
  status: "draft" | "published" | "archived";
  frozen: boolean;
  /**
   * How many named chairs the plan holds.
   *
   * Present on a LISTING, so plans can be told apart without opening each one,
   * which is the whole reason the library exists. Absent from a single plan's
   * detail, where the seats themselves are right there.
   */
  seatCount?: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
}

export interface LayoutSection {
  id: string;
  name: string;
  kind: SectionKind;
  capacity: number;
  /** Where the block sits, as its CENTRE. */
  offsetX: number;
  offsetY: number;
  /** The size of a marker. Zero for a block of seats, whose size is its seats. */
  width: number;
  height: number;
  /**
   * The price band these seats fall in by default, as it was SET.
   *
   * Empty when the section's own name is doing the work, which is the case for
   * every room that does not need sub-sector pricing. The resolved band travels
   * on each seat.
   */
  category?: string;
  /** Degrees clockwise this block is turned about its own centre. */
  rotation?: number;
  displayOrder: number;
  /**
   * The form this block was generated from, echoed back by the server.
   *
   * It is what makes a saved room EDITABLE. The seats are an output, and many
   * different forms produce the same coordinates, so nothing could recover "ten
   * rows of sixteen, aisle after six, odd/even from the centre" from a field of
   * dots: a builder without this could only ever create rooms, never reopen
   * one.
   */
  definition?: SectionSpec;
}

/**
 * The scenery of a drawn room, as the buyer's map would carry it.
 *
 * One conversion, used by the organiser's canvas and by anything previewing a
 * stored layout, so a stage drawn in the builder and a stage on the buyer's map
 * are the same rectangle in the same place.
 */
export function markersOf(sections: LayoutSection[]): Marker[] {
  return sections
    .filter((section) => isMarkerKind(section.kind))
    .map((section) => ({
      id: section.id,
      name: section.name,
      kind: section.kind as Marker["kind"],
      capacity: section.capacity,
      x: section.offsetX,
      y: section.offsetY,
      width: section.width,
      height: section.height,
    }));
}

export interface LayoutSeat {
  id: string;
  sectionId: string;
  row: string;
  seat: string;
  x: number;
  y: number;
  kind: SeatKind;
  /**
   * The price band this chair sells in, already RESOLVED by the server.
   *
   * The fallback, the seat's own band, then its section's, then the section's
   * name, is a rule, and a rule repeated in a browser is a rule with two
   * answers. Group by this and nothing else.
   */
  category: string;
  rowOrder: number;
  seatOrder: number;
}

export interface LayoutDetail {
  layout: Layout;
  sections: LayoutSection[];
  seats: LayoutSeat[];
  /** The room's price bands, in the order their colour is assigned. */
  bands: string[];
}

/** A previewed room: the geometry, and what it is short of. */
export interface LayoutPreview {
  sections: LayoutSection[];
  seats: LayoutSeat[];
  /**
   * Measured against the DRAFT being drawn, not the saved room.
   *
   * The studio used to fetch this for the stored layout and show it beside a
   * canvas of the draft, which produced "against 0 places, the quotas are met"
   * next to a 192-seat sector. A number that describes a different room than
   * the one on screen is worse than none: it reads as a clearance.
   */
  compliance?: Compliance;
  /**
   * Chairs that would satisfy what is missing, keyed "ROW/SEAT".
   *
   * Present only when something is missing. It is what makes the compliance
   * warning actionable: the panel used to say "mark the seats in the section
   * form" while the form had no way to mark a seat at all.
   */
  suggestedKinds?: Record<string, SeatKind>;
  /**
   * The sections drawn on top of each other, by id.
   *
   * Computed by the SAME rule the save refuses with, which is why it comes back
   * from the server rather than being worked out here: a second copy of "is
   * this room physically possible" would disagree the moment either was
   * touched, and the copy the organiser could see would be the wrong one.
   *
   * Reported on a preview and refused on a save, on purpose. The canvas has to
   * be able to draw a collision: that is how somebody sees the one they are
   * making.
   */
  collisions?: string[];
  /**
   * The room's price bands, in the order their colour is assigned.
   *
   * Slot one is the palette's first hue, slot two the second. The order is the
   * colour, which is why it comes from the server.
   */
  bands?: string[];
}

/**
 * The accessibility report, which is the law rather than a preference.
 *
 * A report and not a gate: the platform cannot know whether a given room is
 * legally a casa de espetáculo, and blocking on a wrong guess stops a
 * legitimate sale. The organiser carries the liability and is the one who has
 * to see the number.
 */
export interface Compliance {
  capacity: number;
  requiredWheelchair: number;
  requiredReducedMobility: number;
  requiredObese: number;
  haveWheelchair: number;
  haveReducedMobility: number;
  haveObese: number;
  haveCompanion: number;
  compliant: boolean;
}

/** One block of the room, as the generator's form describes it. */
export interface SectionSpec {
  name: string;
  kind: SectionKind;
  capacity?: number;
  displayOrder?: number;
  /** Straight rows, or arcs around an arena. */
  rowShape?: RowShape;
  rows?: number;
  seatsPerRow?: number;
  firstRowLetter?: string;
  /** Lettered rows run out after 24; an arena numbers them. */
  rowLabels?: RowLabelStyle;
  numbering?: Numbering;
  skips?: number[];
  curve?: number;
  seatGap?: number;
  rowGap?: number;
  /**
   * Where the block sits.
   *
   * Without it every section generates on the same spot and a room of several
   * blocks is one pile, which is what made a custom layout (a stage, a column
   * of chairs, VIP wings beside it) impossible to express.
   */
  offsetX?: number;
  offsetY?: number;
  /**
   * The size of a MARKER: a stage, an arena. Meaningless for a block of seats,
   * whose size is its seats.
   *
   * Stored rather than derived. The arena disc used to be computed from the
   * nearest seat, so it changed whenever a seat moved and grew to swallow the
   * room on a partial stand.
   */
  width?: number;
  height?: number;
  /** Arc only: distance from the arena's centre, and the sector it covers. */
  radius?: number;
  startAngle?: number;
  sweepAngle?: number;
  /**
   * Arc only: the spacing along a row.
   *
   * Set it and each row is filled at this pitch, so a row gains seats as it
   * gets further out, which is what a real stand does. A fixed count per row
   * spreads the back rows apart and reads as a fan of dots.
   */
  seatPitch?: number;
  /** Round tables instead of rows. Each table is its own row of seats. */
  tables?: number;
  seatsPerTable?: number;
  tableRadius?: number;
  tablesPerRow?: number;
  tableGap?: number;
  firstTable?: number;
  /** Individual chairs, keyed "FILA/ASSENTO", as in "K/12". */
  seatKinds?: Record<string, SeatKind>;
  /**
   * Turns a block of seats, in degrees clockwise about its own centre.
   *
   * The one arrangement dragging and resizing cannot express: rows run along x,
   * and VIP wings down the SIDES of a room need a block running along y. A
   * marker or a counted area has no need of it: a tall camarote is a resize.
   */
  rotation?: number;
  /** The price band these seats fall in by default. Empty means the name. */
  category?: string;
  /**
   * Individual chairs put in a different price band, keyed "FILA/ASSENTO".
   *
   * What prices the front three rows above the rest, and the partial-view chair
   * behind a pillar below it, neither of which is a contiguous block that could
   * be a sector of its own.
   */
  seatCategories?: Record<string, string>;
}

export function createVenue(name: string) {
  return apiFetch<{ data: Venue }>("/api/v1/venues", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listVenues() {
  return apiFetch<{ data: Venue[]; total: number }>("/api/v1/venues");
}

export function createLayout(
  venueId: string,
  body: { name: string; viewBoxWidth?: number; viewBoxHeight?: number },
) {
  return apiFetch<{ data: Layout }>(`/api/v1/venues/${venueId}/layouts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listLayouts(venueId: string) {
  return apiFetch<{ data: Layout[] }>(`/api/v1/venues/${venueId}/layouts`);
}

export async function fetchLayout(layoutId: string): Promise<LayoutDetail | null> {
  const { data } = await apiFetch<{
    data: Layout;
    sections: LayoutSection[];
    seats: LayoutSeat[];
    bands?: string[];
  }>(`/api/v1/layouts/${layoutId}`);
  if (!data) return null;
  return {
    layout: data.data,
    sections: data.sections ?? [],
    seats: data.seats ?? [],
    bands: data.bands ?? [],
  };
}

export function generateLayout(layoutId: string, sections: SectionSpec[]) {
  return apiFetch<{
    data: Layout;
    sections: LayoutSection[];
    seats: LayoutSeat[];
  }>(`/api/v1/layouts/${layoutId}/sections`, {
    method: "PUT",
    body: JSON.stringify({ sections }),
  });
}

/**
 * Build a room and store nothing.
 *
 * What the studio's canvas draws while the organiser types. It calls the SAME
 * generator the save calls, which is the point: laying out rows, aisles,
 * odd/even numbering and arc bearings a second time in TypeScript would be two
 * answers to "what does this room look like", and the preview would be the one
 * that lies.
 */
export function previewLayout(layoutId: string, sections: SectionSpec[]) {
  return apiFetch<LayoutPreview>(`/api/v1/layouts/${layoutId}/preview`, {
    method: "POST",
    body: JSON.stringify({ sections }),
  });
}

export function fetchCompliance(layoutId: string) {
  return apiFetch<Compliance>(`/api/v1/layouts/${layoutId}/compliance`);
}

export function publishLayout(layoutId: string) {
  return apiFetch<void>(`/api/v1/layouts/${layoutId}/publish`, {
    method: "POST",
  });
}

/**
 * Put a drawn room on sale for one night, priced by band.
 *
 * Keyed by the band's NAME rather than by a section id, because where a seat is
 * and what it costs change on different clocks: the room is fixed for years and
 * the price list changes every night. Two wings can share a band, and the front
 * rows of one sector can carry their own.
 */
export function bindSeating(
  eventId: string,
  body: { layoutId: string; ticketByCategory: Record<string, string> },
) {
  return apiFetch<{ eventId: string; seatCount: number }>(`/api/v1/events/${eventId}/seating`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function bindAreaTickets(eventId: string, ticketBySection: Record<string, string>) {
  return apiFetch<void>(`/api/v1/events/${eventId}/seating/areas`, {
    method: "PUT",
    body: JSON.stringify({ ticketBySection }),
  });
}

export function blockSeats(eventId: string, seatIds: string[], reason: string) {
  return apiFetch<{ moved: number }>(`/api/v1/events/${eventId}/seats/block`, {
    method: "POST",
    body: JSON.stringify({ seatIds, reason }),
  });
}

export function unblockSeats(eventId: string, seatIds: string[]) {
  return apiFetch<{ moved: number }>(`/api/v1/events/${eventId}/seats/unblock`, {
    method: "POST",
    body: JSON.stringify({ seatIds }),
  });
}
