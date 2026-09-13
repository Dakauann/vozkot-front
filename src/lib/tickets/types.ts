/**
 * The box office domain as the API hands it over.
 *
 * A ticket here is an INGRESSO: admission to an event. It is priced, stocked,
 * put on sale and sold out. The English word collides with the support-desk
 * sense and shares nothing else with it — there is no assignee, no priority and
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
  eventName: string;
  /** The tier being sold: Pista, Camarote, Meia-entrada. */
  title: string;
  description: string;
  venue: string;
  city: string;
  /** ISO. The doors time, not when the row was created. */
  startsAt: string;
  /** Centavos. No float ever touches a price. */
  priceCents: number;
  currency: string;
  quantity: number;
  sold: number;
  available: number;
  status: TicketStatus;
  media: TicketMedia[];
  createdAt: string;
  updatedAt: string;
}

/** Create and update carry the same fields; the API replaces the whole record. */
export interface TicketInput {
  eventName: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string;
  priceCents: number;
  quantity: number;
  status: TicketStatus;
}

export interface TicketQuery {
  status?: TicketStatus | "";
  q?: string;
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
