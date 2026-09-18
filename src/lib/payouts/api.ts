"use client";

import { apiFetch } from "@/lib/api/client";

import type { Balance, LedgerPage } from "./types";

/**
 * The organiser's own money.
 *
 * Both endpoints are scoped to the SESSION on the server: the organiser id is
 * never a parameter, so there is no id to pass here and none to get wrong. A
 * caller cannot ask for somebody else's balance because there is nowhere to put
 * the request.
 */

const BASE = "/api/v1/organiser";

/** Available, pending, reserved and the whole claim, as of now. */
export function getBalance() {
  return apiFetch<Balance>(`${BASE}/balance`);
}

export interface LedgerQuery {
  /** Narrows the statement to one show. */
  eventId?: string;
  limit?: number;
  offset?: number;
}

/** Every movement on the balance, newest first. */
export function listLedger(query: LedgerQuery = {}) {
  const params = new URLSearchParams();
  if (query.eventId) params.set("eventId", query.eventId);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const suffix = params.toString();
  return apiFetch<LedgerPage>(`${BASE}/ledger${suffix ? `?${suffix}` : ""}`);
}
