"use client";

import { apiFetch } from "@/lib/api/client";

/** One tier's line on an order. */
export interface OrderItem {
  ticketId: string;
  /** The tier's name as it was when the order was placed, not as it is now. */
  ticketTitle: string;
  quantity: number;
  /** The FACE value: the organiser's price, and their share of this line. */
  unitPriceCents: number;
  totalCents: number;
  /** The service fee on top, per ticket and for the line. */
  unitFeeCents: number;
  feeCents: number;
}

/** The night an order is for. Absent when the event has since been removed. */
export interface OrderEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  venue: string;
  city: string;
  uf: string;
  coverUrl?: string;
}

/** The order as the API returns it. */
export interface Order {
  id: string;
  eventId: string;
  items: OrderItem[];
  /** Every line added up, so a summary need not do the arithmetic. */
  quantity: number;
  buyerName: string;
  buyerEmail: string;
  /**
   * `subtotalCents` is the tickets, `serviceFeeCents` is the charge on top, and
   * `totalCents` is what the buyer pays — always the sum of the two.
   *
   * All three come from the server. The split cannot be derived here: the rate
   * that produced it is deliberately not sent, because an old order was charged
   * an old one and recomputing it would rewrite what somebody already paid.
   */
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  currency: string;
  status:
    | "pending_payment"
    | "paid"
    | "expired"
    | "cancelled"
    | "failed"
    | "refunded"
    | "refund_required";
  /** ISO. The clock a checkout screen counts down. */
  holdExpiresAt: string;
  /**
   * False while the buyer is still on the details form. An unconfirmed order
   * holds stock on the short cart window and has no charge behind it yet.
   */
  confirmed: boolean;
  payment: {
    provider: string;
    id?: string;
    status: string;
    method: string;
    /** The EMV string a bank app reads. Empty until the charge job has run. */
    pixCopyPaste?: string;
    /** The same payload as a PNG, ready for an img src. */
    pixQrCodeBase64?: string;
  };
  event?: OrderEvent;
  /**
   * The cancellation state, present on a listing when a request is already in
   * flight. The full eligibility — including the deadline — is fetched per
   * order from /refund-eligibility when the buyer opens one.
   */
  refund?: {
    requestable: boolean;
    until?: string;
    refusal?: string;
    status?: "pending" | "approved" | "rejected";
    requestId?: string;
  };
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReserveInput {
  items: {
    ticketId: string;
    quantity: number;
    /**
     * The named chairs, for a reserved event. Omitted for counted stock.
     *
     * Their presence is what makes the line seated. The server derives the
     * quantity from them and refuses a line where the two disagree, so sending
     * both is a consistency check rather than a duplication.
     */
    seatIds?: string[];
  }[];
}

export interface ConfirmInput {
  name: string;
  email: string;
  document: string;
}

/**
 * Takes the tickets off the shelf.
 *
 * Called when the buyer REACHES the details form, not when they submit it.
 * Reserving on submit means every buyer fills in their name, their email and
 * their CPF against stock anyone can still take, and finds out at the last
 * keystroke that it is gone. The window opened here is deliberately short; it
 * becomes the full payment window at confirm.
 *
 * The idempotency key is generated ONCE per attempt and reused for every retry
 * of that attempt, which is the entire contract: a buyer whose phone drops the
 * response and retries must get the order they already have, not a second hold
 * on a second set of tickets. Generating a fresh key on retry would defeat the
 * mechanism completely.
 */
export function reserveCheckout(input: ReserveInput, idempotencyKey: string) {
  return apiFetch<{ data: Order }>("/api/v1/checkout", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/**
 * Records who is buying, extends the hold to the payment window and asks for
 * the PIX charge.
 *
 * Safe to call twice: the second call saves corrected details without buying
 * more time or a second charge.
 */
export function confirmOrder(id: string, buyer: ConfirmInput) {
  return apiFetch<{ data: Order }>(`/api/v1/orders/${id}/confirm`, {
    method: "POST",
    body: JSON.stringify({ buyer }),
  });
}

export function getOrder(id: string) {
  return apiFetch<{ data: Order }>(`/api/v1/orders/${id}`);
}

export function cancelOrder(id: string) {
  return apiFetch<{ data: Order }>(`/api/v1/orders/${id}/cancel`, { method: "POST" });
}

export interface OrderPage {
  data: Order[];
  total: number;
  limit: number;
  offset: number;
}

/** The buyer's own orders, newest first. */
export function listOrders(
  query: {
    /**
     * One status, or several.
     *
     * Several are sent as a REPEATED `status` parameter, which is what the API
     * reads and what URLSearchParams already produces with `append`. A comma
     * list would mean inventing an encoding on both sides for a thing the URL
     * spec already expresses.
     */
    status?: string | readonly string[];
    eventId?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const params = new URLSearchParams();
  for (const status of typeof query.status === "string" ? [query.status] : (query.status ?? [])) {
    if (status) params.append("status", status);
  }
  if (query.eventId) params.set("eventId", query.eventId);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.toString();
  return apiFetch<OrderPage>(`/api/v1/orders${suffix ? `?${suffix}` : ""}`);
}

/**
 * A key for one checkout attempt.
 *
 * crypto.randomUUID where it exists, which is everywhere this app runs, with a
 * fallback that is still unique enough for the job: the key only has to be
 * unique per buyer per attempt, not globally unguessable.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
