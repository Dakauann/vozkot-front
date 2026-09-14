/**
 * The box office domain as the API hands it over.
 *
 * A ticket here is an INGRESSO: admission to an event. It is priced, stocked,
 * put on sale and sold out. The English word collides with the support-desk
 * sense and shares nothing else with it, there is no assignee, no priority and
 * no conversation thread anywhere in this file.
 */

export type TicketStatus = "draft" | "on_sale" | "sold_out" | "cancelled";

export type TicketSort = "starts_at" | "created_at" | "price";

export type MediaKind = "image" | "video";

export interface TicketMedia {
  id: string;
  kind: MediaKind;
  url: string;
  contentType: string;
  sizeBytes: number;
  position: number;
  createdAt: string;
}

export interface Ticket {
  id: string;
  /**
   * The event this tier sells admission to.
   *
   * The event owns the name, venue, city, date, category and map pin. A tier
   * owns only what varies between tiers of the same event: what it is called,
   * what it costs and how many exist.
   */
  eventId: string;
  /** The tier being sold: Pista, Camarote, Meia-entrada. */
  title: string;
  description: string;
  /** Centavos. No float ever touches a price. */
  priceCents: number;
  currency: string;
  quantity: number;
  sold: number;
  /**
   * Stock held by orders waiting to be paid.
   *
   * Neither sold nor available, and the distinction is what an operator needs
   * on the night: a tier that is nearly gone has gone either to sales, which
   * are money, or to holds, which expire. Folding the two into "available"
   * hides which of those just happened.
   */
  reserved: number;
  available: number;
  status: TicketStatus;
  media: TicketMedia[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Create and update carry the same fields; the API replaces the whole record.
 *
 * `eventId` is only read on create. An update cannot move a tier to another
 * event, because orders already reference it and moving it would rewrite what
 * somebody already bought.
 */
export interface TicketInput {
  eventId: string;
  title: string;
  description: string;
  priceCents: number;
  quantity: number;
  status: TicketStatus;
}

export interface TicketQuery {
  status?: TicketStatus | "";
  q?: string;
  /** One event's tiers. What managing a single event asks for. */
  eventId?: string;
  sort?: TicketSort;
  limit?: number;
  offset?: number;
}

export interface TicketPage {
  data: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

export const ticketStatuses: TicketStatus[] = ["draft", "on_sale", "sold_out", "cancelled"];

/**
 * The formats the API accepts, kept in step with domain/media's allowlist. It
 * feeds the file input's accept attribute, so the picker offers exactly what
 * the server will take instead of letting someone choose a PDF and fail.
 */
export const acceptedMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_MEDIA_PER_TICKET = 12;

export function totalStockValue(tickets: Ticket[]): number {
  return tickets.reduce((sum, ticket) => sum + ticket.available * ticket.priceCents, 0);
}

export function totalAvailable(tickets: Ticket[]): number {
  return tickets.reduce((sum, ticket) => sum + ticket.available, 0);
}
