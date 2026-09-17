/**
 * The catalogue as the API hands it over.
 *
 * An EVENT is the happening a buyer browses: one night, one place, one poster,
 * one category. A TICKET is a tier underneath it, Pista, Camarote, carrying a
 * price and a number of seats. The two were one thing once, which is why a
 * listing had to group by a repeated string and two tiers of the same night
 * could disagree about where it was.
 */

export type EventStatus = "draft" | "published" | "cancelled";

/**
 * How an event sells: by the number, or by the chair.
 *
 * `counted` is a quantity — a party, a pista, a festival, where the tier's own
 * quantity is the whole inventory. `seated` is stock with an identity: fila K,
 * poltrona 12.
 *
 * It is the organiser's DECLARATION and not the authority on anything. Whether
 * a night actually has seats is answered by the seats themselves. This exists
 * because the interface has to know before that is decidable — a create form
 * cannot bind a plan, but it can ask, and the answer is what stops every screen
 * afterwards from guessing.
 */
export type EventSalesMode = "counted" | "seated";

/**
 * The fixed taxonomy, in the order the filter row offers it.
 *
 * What is NOT here matters as much as what is: "free" and "online" are filters,
 * not categories. An event is not free instead of being a show, it is a free
 * show, and a buyer must be able to ask for both.
 */
export const EVENT_CATEGORIES = [
  "festas_shows",
  "teatros_espetaculos",
  "stand_up_comedy",
  "cursos_workshops",
  "congressos_palestras",
  "esportivo",
  "gastronomia",
  "religiao_espiritualidade",
  "passeios_tours",
  "infantil",
  "games_geek",
  "moda_beleza",
  "saude_bem_estar",
  "arte_cultura_lazer",
  "pride",
  "outros",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_SORTS = ["relevance", "starts_at", "price", "created_at"] as const;

export type EventSort = (typeof EVENT_SORTS)[number];

export type MediaKind = "image" | "video";

export interface EventMedia {
  id: string;
  kind: MediaKind;
  url: string;
  contentType: string;
  sizeBytes: number;
  position: number;
  /**
   * The original's pixel dimensions, so a card can reserve the right box before
   * the bytes arrive. Absent on assets uploaded before the pipeline existed.
   */
  width?: number;
  height?: number;
  /**
   * A complete `data:image/jpeg;base64,…` a few hundred bytes long. It goes
   * straight into an img src and needs no decoder, which is why it beats a hash
   * on a server-rendered page.
   */
  blurDataUrl?: string;
}

export interface EventLocation {
  venue: string;
  address: string;
  neighborhood: string;
  city: string;
  uf: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  /**
   * Built server-side, so every client opens the same place and none of them
   * has to know a map provider's URL shape. Absent without coordinates.
   */
  mapsUrl?: string;
  wazeUrl?: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: EventCategory;
  location: EventLocation;
  /** ISO. Doors, not when the row was typed. */
  startsAt: string;
  endsAt?: string;
  status: EventStatus;
  /** How this event means to sell. Absent on older records, which were counted. */
  salesMode?: EventSalesMode;
  media: EventMedia[];
  createdAt: string;
  updatedAt: string;
}

/** A listing card: the event plus the two numbers that are not on it. */
export interface EventListing extends EventSummary {
  /** Centavos, of the cheapest tier still on sale. Null renders "Esgotado". */
  fromPriceCents: number | null;
  availableTickets: number;
}

export interface EventPage {
  data: EventListing[];
  total: number;
  limit: number;
  offset: number;
}

/** A tier, as the event page sells it. */
export interface TicketTier {
  id: string;
  eventId: string;
  title: string;
  description: string;
  /** The FACE value the organiser set: their share, and what a listing shows. */
  priceCents: number;
  /**
   * The service fee on ONE ticket, and what the buyer actually pays for it.
   *
   * Both come from the server, priced by the same fee the checkout will apply,
   * so the event page and the order can never quote different numbers. Absent
   * on older responses, hence optional; a missing fee renders as no fee, which
   * is exactly right for a deployment that charges none.
   */
  feeCents?: number;
  totalCents?: number;
  currency: string;
  quantity: number;
  sold: number;
  available: number;
  status: "draft" | "on_sale" | "sold_out" | "cancelled";
}

export interface CategoryOption {
  value: EventCategory;
  /** Zero means the filter greys it out rather than hiding it. */
  count: number;
}

export interface CityOption {
  city: string;
  uf: string;
  count: number;
}

export interface CatalogueFilters {
  categories: CategoryOption[];
  cities: CityOption[];
}

/**
 * The listing query, which is also the URL.
 *
 * Every field here is a query parameter people share, bookmark and edit by
 * hand, so the names are the ones that appear in the address bar.
 */
export interface EventQuery {
  q?: string;
  category?: EventCategory;
  city?: string;
  /** ISO. Inclusive on both ends. */
  from?: string;
  until?: string;
  maxPrice?: number;
  free?: boolean;
  available?: boolean;
  sort?: EventSort;
  limit?: number;
  offset?: number;
}

/** Matches the server's own ceiling, so a client cannot ask for more. */
export const MAX_PAGE_SIZE = 60;
export const DEFAULT_PAGE_SIZE = 24;

/**
 * The deepest the API will page.
 *
 * A keyset cursor would go further, but nobody browses to event 5,001, they
 * search. The ceiling exists because OFFSET makes the database walk and discard
 * every row before it, so a crawler following page links forever would turn
 * each request into a full scan.
 */
export const MAX_OFFSET = 5000;
