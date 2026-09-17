"use client";

import { apiFetch } from "@/lib/api/client";

/**
 * Refunds: the buyer's self-service cancellation and the organiser's inbox.
 *
 * The windows are decided entirely on the server — one pure function that the
 * eligibility endpoint and the request endpoint both call — so nothing here
 * computes a deadline. This module asks and renders the answer, which is what
 * keeps the button on screen and the rule behind it from ever disagreeing.
 */

/** Why a refund is being asked for. The grounds decide the window. */
export type RefundReason =
  | "buyer_withdrawal"
  | "event_cancelled"
  | "organiser_goodwill"
  | "operator";

/** Where the DECISION stands. Whether the money arrived is the order's status. */
export type RefundStatus = "pending" | "approved" | "rejected";

/** Why a refund is not allowed, when it is not. */
export type RefundRefusal =
  | "window_closed"
  | "too_close_to_event"
  | "not_paid"
  | "already_refunded"
  | "event_passed"
  | "request_open";

export interface RefundRequest {
  id: string;
  orderId: string;
  eventId?: string;
  reason: RefundReason;
  status: RefundStatus;
  /**
   * What goes back to the BUYER, and how much of it is the platform's service
   * fee. Both are ABSENT for an organiser: the API omits them rather than
   * zeroing them, because our commission is not theirs to see.
   *
   * Render `organiserCents` on any organiser-facing surface. See
   * SeesPlatformShare in the Go package `usecases/refund`.
   */
  amountCents?: number;
  feeCents?: number;
  /** The part of the refund that comes out of the organiser's revenue. */
  organiserCents: number;
  /** True when the POLICY decided rather than a person. */
  autoApproved: boolean;
  requestedBy?: string;
  note?: string;
  decidedBy?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundEligibility {
  allowed: boolean;
  /** ISO. The deadline for the right of withdrawal, absent when there is none. */
  until?: string;
  refusal?: RefundRefusal;
  /** Absent for an organiser; see the note on `RefundRequest`. */
  amountCents?: number;
  feeCents?: number;
  /** The part of the refund that comes out of the organiser's revenue. */
  organiserCents: number;
  /** The service fee comes back too. Say so beside the amount. */
  refundsFees: boolean;
  /** The request already in flight, when there is one. */
  request?: RefundRequest;
}

export function getRefundEligibility(orderId: string) {
  return apiFetch<RefundEligibility>(
    `/api/v1/orders/${encodeURIComponent(orderId)}/refund-eligibility`,
  );
}

/**
 * Asks for the money back.
 *
 * Inside the legal window the server approves it on the spot and the estorno is
 * queued; outside it, the request lands pending for the organiser. Either way
 * the answer comes back as a request whose `status` says which happened, so the
 * screen does not have to guess.
 */
export function requestRefund(orderId: string, body: { reason?: RefundReason; note?: string } = {}) {
  return apiFetch<{ data: RefundRequest }>(
    `/api/v1/orders/${encodeURIComponent(orderId)}/refund-request`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export interface RefundPage {
  data: RefundRequest[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The organiser's inbox when `eventId` is given, the buyer's own history when
 * it is not. The scoping happens on the server from the session.
 */
export function listRefundRequests(
  query: { eventId?: string; status?: RefundStatus; open?: boolean; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.eventId) params.set("eventId", query.eventId);
  if (query.status) params.set("status", query.status);
  if (query.open) params.set("open", "true");
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  const suffix = params.toString();
  return apiFetch<RefundPage>(`/api/v1/refund-requests${suffix ? `?${suffix}` : ""}`);
}

export function approveRefund(id: string, note?: string) {
  return apiFetch<{ data: RefundRequest }>(
    `/api/v1/refund-requests/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({ note: note ?? "" }) },
  );
}

export function rejectRefund(id: string, note?: string) {
  return apiFetch<{ data: RefundRequest }>(
    `/api/v1/refund-requests/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify({ note: note ?? "" }) },
  );
}
