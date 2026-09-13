import { API_URL } from "@/lib/api/url";

import { buildEventQuery } from "./query";
import type { CatalogueFilters, EventPage, EventQuery, EventSummary, TicketTier } from "./types";

/**
 * The public catalogue.
 *
 * These are the only API calls in the app that do NOT go through the client
 * wrapper, and the reason is that they run on the server: the listing and the
 * event page are server components, so they fetch during render, with no
 * cookies, no session and no browser to abort them. Routing them through a
 * "use client" module would drag the whole catalogue into the browser and give
 * up the HTML that makes these pages findable.
 */

const PUBLIC = `${API_URL}/api/v1/public`;

/** How long a rendered catalogue page may be reused. */
const LISTING_REVALIDATE_SECONDS = 60;
/**
 * An event page is revalidated faster than a listing because it carries the
 * availability a buyer is about to act on. It is still not the source of truth:
 * stock is decided by a conditional UPDATE at checkout, so a stale "4 left" can
 * disappoint a buyer but can never oversell.
 */
const EVENT_REVALIDATE_SECONDS = 15;

/**
 * How long the catalogue will wait for the API before giving up on it.
 *
 * Without this, `fetch` waits as long as the socket stays open, and a single
 * slow upstream pins a server render worker for minutes — first the page never
 * paints, then every worker is stuck on the same call and the whole site stops
 * answering. Three seconds is generous for a query that takes eleven
 * milliseconds, and the fallbacks below already render a usable page.
 */
const TIMEOUT_MS = 3_000;

/**
 * A GET with a deadline.
 *
 * AbortSignal.timeout rather than a manual controller and setTimeout: it needs
 * no cleanup, so it cannot leak a timer when the request settles first.
 */
function get(url: string, revalidate: number): Promise<Response> {
  return fetch(url, {
    next: { revalidate },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}


/**
 * listEvents never throws.
 *
 * A catalogue whose API is having a bad minute should render an empty state a
 * person can act on, not a stack trace: the filters still work, the search box
 * still works, and a reload costs nothing. Throwing here would replace all of
 * that with an error page.
 */
export async function listEvents(query: EventQuery = {}): Promise<EventPage> {
  const suffix = buildEventQuery(query);
  const empty: EventPage = {
    data: [],
    total: 0,
    limit: query.limit ?? 24,
    offset: query.offset ?? 0,
  };
  try {
    const url = `${PUBLIC}/events${suffix ? `?${suffix}` : ""}`;
    const response = await get(url, LISTING_REVALIDATE_SECONDS);
    if (!response.ok) {
      console.error(`events: public list returned ${response.status} from ${url}`);
      return empty;
    }
    return (await response.json()) as EventPage;
  } catch (error) {
    console.error("events: public list request failed", error);
    return empty;
  }
}

/** Null means "no such published event", which the page renders as notFound(). */
export async function getEvent(slug: string): Promise<EventSummary | null> {
  try {
    const response = await get(`${PUBLIC}/events/${encodeURIComponent(slug)}`, EVENT_REVALIDATE_SECONDS);
    if (!response.ok) return null;
    const payload = (await response.json()) as { data: EventSummary };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

/** The tiers an event sells, which is what the buy panel is built from. */
export async function getEventTiers(eventId: string): Promise<TicketTier[]> {
  try {
    const response = await get(`${PUBLIC}/events/${encodeURIComponent(eventId)}/tiers`, EVENT_REVALIDATE_SECONDS);
    if (!response.ok) return [];
    const payload = (await response.json()) as { data: TicketTier[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

/**
 * The filter row's own options.
 *
 * Fetched rather than hardcoded so a category with nothing in it can be greyed
 * out instead of leading every buyer who picks it to an empty page.
 */
export async function getCatalogueFilters(): Promise<CatalogueFilters> {
  const empty: CatalogueFilters = { categories: [], cities: [] };
  try {
    const response = await get(`${PUBLIC}/filters`, LISTING_REVALIDATE_SECONDS);
    if (!response.ok) return empty;
    const payload = (await response.json()) as { data: CatalogueFilters };
    return payload.data ?? empty;
  } catch {
    return empty;
  }
}
