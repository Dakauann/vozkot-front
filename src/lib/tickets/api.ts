"use client";

import { apiFetch, UPLOAD_TIMEOUT_MS } from "@/lib/api/client";

import type {
  Ticket,
  TicketInput,
  TicketMedia,
  TicketPage,
  TicketQuery,
  TicketStatus,
} from "./types";

const BASE = "/api/v1/tickets";

export function listTickets(query: TicketQuery = {}) {
  const search = new URLSearchParams();
  if (query.status) search.set("status", query.status);
  if (query.q?.trim()) search.set("q", query.q.trim());
  if (query.eventId) search.set("eventId", query.eventId);
  if (query.sort) search.set("sort", query.sort);
  if (query.limit !== undefined) search.set("limit", String(query.limit));
  if (query.offset) search.set("offset", String(query.offset));

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return apiFetch<TicketPage>(`${BASE}${suffix}`);
}

export function getTicket(id: string) {
  return unwrap(apiFetch<{ data: Ticket }>(`${BASE}/${id}`));
}

export function createTicket(input: TicketInput) {
  return unwrap(
    apiFetch<{ data: Ticket }>(BASE, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export function updateTicket(id: string, input: TicketInput) {
  // Spelled out rather than spread, because the update endpoint takes exactly
  // these five and decodes with DisallowUnknownFields. `eventId` is the one
  // TicketInput carries that it rejects — a lote belongs to the event it was
  // created under — and sending it failed every rename with
  // `json: unknown field "eventId"` instead of being ignored.
  const body = {
    title: input.title,
    description: input.description,
    priceCents: input.priceCents,
    quantity: input.quantity,
    status: input.status,
  };
  return unwrap(
    apiFetch<{ data: Ticket }>(`${BASE}/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
}

export function changeTicketStatus(id: string, status: TicketStatus) {
  return unwrap(
    apiFetch<{ data: Ticket }>(`${BASE}/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  );
}

export function deleteTicket(id: string) {
  return apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}

/**
 * One file per request. The API validates type and size per file, so a rejected
 * clip does not take an accepted image down with it, and the UI can report
 * exactly which file failed.
 */
export function uploadTicketMedia(id: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return unwrap(
    apiFetch<{ data: TicketMedia }>(`${BASE}/${id}/media`, {
      method: "POST",
      body,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    }),
  );
}

export function deleteTicketMedia(ticketId: string, mediaId: string) {
  return apiFetch<void>(`${BASE}/${ticketId}/media/${mediaId}`, { method: "DELETE" });
}

/** Strips the API's `data` envelope so callers work with the entity itself. */
async function unwrap<T>(pending: Promise<{ data?: { data: T }; error?: { message: string; status?: number } }>) {
  const result = await pending;
  return { data: result.data?.data, error: result.error };
}
