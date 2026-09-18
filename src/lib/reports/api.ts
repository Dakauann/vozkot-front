"use client";

import { API_URL } from "@/lib/api/url";
import { apiFetch } from "@/lib/api/client";

import type { AttendeePage, EventReport } from "./types";

/**
 * The organiser's reporting endpoints.
 *
 * Every one is scoped server-side to an event the caller owns, so there is no
 * ownership check to forget here: a 403 is the server refusing, not this
 * module deciding.
 */

const BASE = "/api/v1/events";

/** The whole dashboard for one event: totals plus every breakdown. */
export function getEventReport(eventId: string) {
  return apiFetch<{ data: EventReport }>(`${BASE}/${encodeURIComponent(eventId)}/report`);
}

/**
 * The same dashboard across every event the organiser owns.
 *
 * Takes no id: the scope comes from the session on the server, so there is no
 * parameter here to point at somebody else's portfolio. The response is the
 * same shape as one event's, because it is the same query with one clause
 * swapped. See domain/report.Scope.
 */
export function getPortfolioReport() {
  return apiFetch<{ data: EventReport }>("/api/v1/organiser/report");
}

export interface AttendeeQuery {
  ticketId?: string;
  /** Defaults to paid on the server. "all" includes refunded orders. */
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listAttendees(eventId: string, query: AttendeeQuery = {}) {
  const suffix = buildQuery(query);
  return apiFetch<AttendeePage>(
    `${BASE}/${encodeURIComponent(eventId)}/attendees${suffix ? `?${suffix}` : ""}`,
  );
}

/**
 * The URL the export link points at.
 *
 * A plain href rather than a fetch, and that is deliberate: the endpoint streams
 * a file with a Content-Disposition, so letting the browser navigate to it gets
 * a real download with a progress indicator and the server's filename. Fetching
 * it into memory and building a Blob would buffer an entire arena's worth of
 * rows in the tab to achieve the same thing worse.
 *
 * The session travels as a cookie on a same-site navigation, which is why this
 * works without the Authorization header the fetch client would add.
 */
export function attendeesExportUrl(eventId: string, query: AttendeeQuery = {}): string {
  const suffix = buildQuery(query);
  return `${API_URL}${BASE}/${encodeURIComponent(eventId)}/attendees.csv${suffix ? `?${suffix}` : ""}`;
}

/**
 * Starts the CSV download, refreshing the session first if it has gone stale.
 *
 * The export is a NAVIGATION rather than a fetch, which is what gets a real
 * download with the server's own filename instead of an arena buffered into the
 * tab. The cost of that is the one thing a navigation cannot do: it does not go
 * through the API client, so it has no access to the reactive refresh that
 * every other call gets after a 401. An organiser who left the report open past
 * the access token's lifetime would have the browser navigate to a JSON error
 * page instead of downloading anything.
 *
 * So a cheap authenticated read runs first, purely for its side effect: it goes
 * through apiFetch, so an expired token is rotated before the navigation that
 * depends on it. `/user/profile` is one indexed row and no counting.
 *
 * A failure here is not fatal. The navigation happens anyway: the session may
 * be perfectly valid and this call may have failed for some other reason, and
 * refusing to download on that basis would be worse than letting the server
 * answer for itself.
 */
export async function downloadAttendees(eventId: string, query: AttendeeQuery = {}): Promise<void> {
  await apiFetch<unknown>("/user/profile").catch(() => undefined);
  window.location.assign(attendeesExportUrl(eventId, query));
}

function buildQuery(query: AttendeeQuery): string {
  const params = new URLSearchParams();
  if (query.ticketId) params.set("ticketId", query.ticketId);
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  return params.toString();
}
