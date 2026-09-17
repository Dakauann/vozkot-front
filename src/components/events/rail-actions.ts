"use server";

import { listEvents } from "@/lib/events/api";
import { MAX_OFFSET, MAX_PAGE_SIZE, type EventListing, type EventQuery } from "@/lib/events/types";

/** What a rail asks for when the reader reaches the end of it. */
export interface RailPage {
  events: EventListing[];
  /** False when the catalogue has nothing further for this rail. */
  more: boolean;
}

/**
 * The next handful of a rail, fetched when somebody scrolls far enough to want
 * it and never before.
 *
 * A landing page carrying five rails used to answer every one of them in full
 * before it could send a byte, which is five catalogue queries and sixty event
 * records on the critical path so that a visitor could read the first four
 * cards of the first row. Most of those records were never scrolled to. Each
 * rail now ships one screenful and asks for the rest here.
 *
 * A server action rather than a public route handler, because the query is the
 * rail's own and not something a caller should be able to shape: only the three
 * fields below survive, so this cannot be turned into an open query endpoint by
 * posting a different body at it.
 */
export async function moreRailEvents(
  query: Pick<EventQuery, "sort" | "from" | "until" | "free" | "available" | "category">,
  offset: number,
  limit: number,
): Promise<RailPage> {
  // The offset comes from a browser and is the one number here that decides how
  // much work the database does, so it is clamped rather than trusted.
  const safeOffset = Math.max(0, Math.min(Math.floor(offset) || 0, MAX_OFFSET));
  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 1, MAX_PAGE_SIZE));

  const page = await listEvents({
    sort: query.sort,
    from: query.from,
    until: query.until,
    free: query.free,
    available: query.available,
    category: query.category,
    limit: safeLimit,
    offset: safeOffset,
  });

  return {
    events: page.data,
    // Asked against the total rather than "a full page came back", which is
    // wrong exactly once: on a catalogue whose last page is exactly full, and
    // that spins an empty request every time somebody reaches the end.
    more: safeOffset + page.data.length < Math.min(page.total, MAX_OFFSET + safeLimit),
  };
}
