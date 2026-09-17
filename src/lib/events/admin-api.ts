"use client";

import { apiFetch, UPLOAD_TIMEOUT_MS, type ApiResult } from "@/lib/api/client";

import { buildEventQuery } from "./query";
import type {
  EventCategory,
  EventMedia,
  EventPage,
  EventQuery,
  EventSalesMode,
  EventStatus,
  EventSummary,
} from "./types";

/**
 * The operator's half of the catalogue.
 *
 * Separate from `api.ts` on purpose, and not only for tidiness. The public
 * module runs on the server during render with no session; this one runs in the
 * browser and goes through the shared client so it carries cookies and gets the
 * single refresh-after-401. Merging them would put a "use client" boundary
 * around the catalogue and drag the whole listing into the browser.
 */

const BASE = "/api/v1/events";

/** What the create and update endpoints accept. */
export interface EventInput {
  name: string;
  description: string;
  category: EventCategory;
  location: {
    venue: string;
    address: string;
    neighborhood: string;
    city: string;
    uf: string;
    postalCode: string;
    /**
     * Optional and travelling together. Sending them means "a person placed
     * this pin", and the server will not overwrite them with whatever its
     * geocoder thinks. Sending neither asks it to geocode.
     */
    latitude?: number;
    longitude?: number;
  };
  /** How this event sells: by quantity, or with a row and a seat number. */
  salesMode: EventSalesMode;
  /** ISO 8601 with an offset. */
  startsAt: string;
  endsAt?: string;
  status: EventStatus;
}

/** The operator listing, which unlike the public one also shows drafts. */
export function listOwnEvents(query: EventQuery = {}) {
  const suffix = buildEventQuery(query);
  return apiFetch<EventPage>(`${BASE}${suffix ? `?${suffix}` : ""}`);
}

export function getOwnEvent(id: string) {
  return unwrap(apiFetch<{ data: EventSummary }>(`${BASE}/${encodeURIComponent(id)}`));
}

export function createEvent(input: EventInput) {
  return unwrap(
    apiFetch<{ data: EventSummary }>(BASE, { method: "POST", body: JSON.stringify(input) }),
  );
}

export function updateEvent(id: string, input: EventInput) {
  return unwrap(
    apiFetch<{ data: EventSummary }>(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  );
}

export function deleteEvent(id: string) {
  return apiFetch<void>(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function publishEvent(id: string) {
  return unwrap(
    apiFetch<{ data: EventSummary }>(`${BASE}/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    }),
  );
}

export function unpublishEvent(id: string) {
  return unwrap(
    apiFetch<{ data: EventSummary }>(`${BASE}/${encodeURIComponent(id)}/unpublish`, {
      method: "POST",
    }),
  );
}

/**
 * Moves the pin.
 *
 * Its own endpoint rather than a field on update, because dragging a pin is its
 * own act: the operator is correcting a geocoder, and a correction must not be
 * able to lose an edit somebody else made to the name or the date in the
 * meantime. One small request, one small change.
 */
export function pinEvent(id: string, latitude: number, longitude: number) {
  return unwrap(
    apiFetch<{ data: EventSummary }>(`${BASE}/${encodeURIComponent(id)}/pin`, {
      method: "POST",
      body: JSON.stringify({ latitude, longitude }),
    }),
  );
}

/**
 * Uploads one asset and returns the event with its media list rebuilt.
 *
 * No Content-Type header: the browser has to set the multipart boundary, and
 * setting the header by hand overwrites it with one that has no boundary at
 * all, which the server then cannot parse.
 */
export function uploadEventMedia(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return unwrap(
    apiFetch<{ data: EventMedia }>(`${BASE}/${encodeURIComponent(id)}/media`, {
      method: "POST",
      body,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    }),
  );
}

export function deleteEventMedia(id: string, mediaId: string) {
  return apiFetch<void>(
    `${BASE}/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`,
    { method: "DELETE" },
  );
}

/**
 * Unwraps the `{ data: … }` envelope the API answers with.
 *
 * The envelope exists so a response can grow a sibling field without breaking
 * clients. Callers here only ever want the payload, and repeating `.data?.data`
 * at every call site is how one of them eventually forgets.
 */
async function unwrap<T>(promise: Promise<ApiResult<{ data: T }>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (result.error) return { error: result.error };
  return { data: result.data?.data };
}
