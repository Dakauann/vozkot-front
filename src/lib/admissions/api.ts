"use client";

import { apiFetch } from "@/lib/api/client";
import { API_URL } from "@/lib/api/url";

/**
 * Admissions: the code that gets somebody through a door.
 *
 * Two audiences, and this module keeps them apart because the server does:
 *
 *   - the HOLDER gets their own codes, and nobody else's. The organiser running
 *     the door cannot read them, because whoever holds a code can walk in on
 *     it.
 *   - the DOORPERSON sends a code and gets back a verdict, never a code.
 *
 * Nothing here validates a code. The check character, the normalisation of the
 * grouped form and the O-for-zero substitutions all live on the server, so a
 * scanner, a keyboard and a paste all reach the same answer. The client's only
 * job is to send what it read.
 */


/**
 * A reserved chair, as the door and the wallet show it.
 *
 * `label` is formatted on the server on purpose. The door screen, the wallet,
 * the receipt and the confirmation email all have to say the same thing about a
 * chair somebody is standing in front of, and four copies of that format string
 * would be four chances to disagree.
 */
export interface AdmissionSeat {
  section?: string;
  row?: string;
  seat?: string;
  label: string;
}

/** Where an admission stands. */
export type AdmissionStatus = "issued" | "admitted" | "void";

/**
 * What the door decided.
 *
 * A closed set rather than a message, so the screen picks its own colour and
 * wording per locale. Only `admitted` opens the door.
 */
export type ScanOutcome =
  | "admitted"
  | "already_admitted"
  | "void"
  | "wrong_event"
  | "not_paid"
  | "unknown"
  | "malformed";

/** One of the holder's tickets. */
export interface Admission {
  id: string;
  ticketTitle: string;
  /** Numbered from 1 within the order, so a group's tickets read "2 de 3". */
  sequence: number;
  /** The printed, grouped form: what a doorperson types. */
  code: string;
  /** The bare characters a QR encodes. Kept for copy-to-clipboard. */
  qrPayload: string;
  status: AdmissionStatus;
  /** The reserved chair. Absent for a general-admission ticket. */
  seat?: AdmissionSeat;
  /** ISO, set once the ticket has been used. */
  admittedAt?: string;
}

export interface ScanResult {
  outcome: ScanOutcome;
  /** The one boolean the screen needs to choose green or red. */
  admitted: boolean;
  ticketTitle?: string;
  /** The reserved chair, so the door can say where to sit. */
  seat?: AdmissionSeat;
  sequence?: number;
  orderReference?: string;
  /** When the code was FIRST used, which is what the holder is told. */
  admittedAt?: string;
  /** The door's running totals, returned with every scan. */
  remaining: number;
  admittedCount: number;
}

export interface DoorCounters {
  remaining: number;
  admittedCount: number;
}

/** The holder's own tickets for one order. */
export function listTickets(orderId: string) {
  return apiFetch<{ data: Admission[] }>(
    `/api/v1/orders/${encodeURIComponent(orderId)}/tickets`,
  );
}

/**
 * The address of a ticket's QR image.
 *
 * Built rather than fetched: it goes straight into an `<img src>` so the
 * browser streams and caches it per session, which is what keeps a wallet of
 * four tickets from being four base64 blobs in the page.
 *
 * Addressed by admission ID and NOT by code. The address of an image ends up
 * in browser history and in any proxy's log; an id that is useless without a
 * session is safe there and a code would not be.
 */
export function ticketQRSource(orderId: string, admissionId: string) {
  return `${API_URL}/api/v1/orders/${encodeURIComponent(orderId)}/tickets/${encodeURIComponent(admissionId)}/qr.png`;
}

/**
 * Reads a code at a door and spends it if it is good.
 *
 * A refusal comes back as a 200 with an outcome, not as an error: "already used
 * at 21:14" is the answer the doorperson needs, and an HTTP error would reduce
 * it to "something went wrong" in front of a queue.
 */
export function scanAdmission(eventId: string, code: string) {
  return apiFetch<{ data: ScanResult }>(
    `/api/v1/events/${encodeURIComponent(eventId)}/scan`,
    { method: "POST", body: JSON.stringify({ code }) },
  );
}

/** The door's counters on their own, for a screen that polls. */
export function getDoorCounters(eventId: string) {
  return apiFetch<{ data: DoorCounters }>(
    `/api/v1/events/${encodeURIComponent(eventId)}/door`,
  );
}

/**
 * Groups a raw code the way a ticket prints it, as the user types.
 *
 * Presentation only. The server normalises whatever arrives, so this exists to
 * make a long code readable in an input and to make the count obvious at a
 * glance — twelve characters in three groups of four.
 */
export const CODE_LENGTH = 12;
export const CODE_GROUP = 4;

export function formatCode(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, CODE_LENGTH);
  const groups: string[] = [];
  for (let start = 0; start < cleaned.length; start += CODE_GROUP) {
    groups.push(cleaned.slice(start, start + CODE_GROUP));
  }
  return groups.join("-");
}

/** How many code characters have actually been typed, ignoring the grouping. */
export function codeLength(raw: string): number {
  return raw.replace(/[^0-9A-Za-z]/g, "").length;
}
