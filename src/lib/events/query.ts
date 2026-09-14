import {
  DEFAULT_PAGE_SIZE,
  EVENT_CATEGORIES,
  EVENT_SORTS,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  type EventCategory,
  type EventQuery,
  type EventSort,
} from "./types";

/**
 * The URL is the catalogue's state, and this module is the only place that
 * knows how to read and write it.
 *
 * It lives in lib rather than in the page for the same reason the backend puts
 * filter normalisation in the domain rather than the handler: the page is
 * delivery, and what a query parameter means is not a delivery concern. Two
 * surfaces already need it: the page parses the address, the API client
 * renders it back, and they must agree exactly, which is only checkable if
 * both halves sit in one testable module.
 */

/** What a page's `searchParams` looks like in the App Router. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Reads the URL into a query, ignoring anything it cannot understand.
 *
 * A catalogue URL is something people edit by hand, share and bookmark for
 * years. A stale category in an old link should show the catalogue, not a 400,
 * so every unknown value is dropped rather than rejected. The same goes for a
 * page number past the end, a negative limit and a garbage sort key: the worst
 * a broken link may do is show more events than the sender meant.
 */
export function parseEventQuery(search: SearchParams | URLSearchParams): EventQuery {
  const one = (key: string): string | undefined => {
    const value = search instanceof URLSearchParams ? search.get(key) : search[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };

  const limit = clamp(one("limit"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  // Pages are clamped by the deepest offset the server will honour. Letting
  // `page=9999` through would ask for an offset the API silently pulls back to
  // its ceiling, so the buyer would see page one's events under a header that
  // says 9999, worse than simply landing on the last reachable page.
  const lastPage = Math.floor(MAX_OFFSET / limit) + 1;
  const page = clamp(one("page"), 1, 1, lastPage);

  const category = one("category");
  const sort = one("sort");
  const maxPrice = clamp(one("maxPrice"), undefined, 0, Number.MAX_SAFE_INTEGER);

  return {
    q: one("q"),
    category: isCategory(category) ? category : undefined,
    city: one("city"),
    from: one("from"),
    until: one("until"),
    maxPrice,
    free: one("free") === "true" || undefined,
    available: one("available") === "true" || undefined,
    sort: isSort(sort) ? sort : undefined,
    limit,
    offset: (page - 1) * limit,
  };
}

/**
 * Renders a query back into a query string.
 *
 * Only what differs from the default is written, which is what keeps a plain
 * `/eventos` from becoming `/eventos?free=false&available=false&offset=0` the
 * first time anyone touches a filter, and keeps the CDN from caching the same
 * page under a dozen spellings.
 */
export function buildEventQuery(query: EventQuery): string {
  const search = new URLSearchParams();
  const set = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== "") search.set(key, value);
  };

  set("q", query.q?.trim());
  set("category", query.category);
  set("city", query.city?.trim());
  set("from", query.from);
  set("until", query.until);
  if (query.maxPrice !== undefined) set("maxPrice", String(query.maxPrice));
  if (query.free) set("free", "true");
  if (query.available) set("available", "true");
  set("sort", query.sort);
  if (query.limit !== undefined) set("limit", String(query.limit));
  if (query.offset) set("offset", String(query.offset));

  return search.toString();
}

/**
 * A server component's `searchParams` as URLSearchParams entries.
 *
 * Repeated parameters arrive as an array, `?city=a&city=b`, and only the
 * first is kept. Every filter here is single-valued, so a repeated one is
 * either a hand-edited link or a crawler permuting the address, and joining
 * them would build a query for a city called "a,b" that matches nothing.
 */
export function toPairs(search: SearchParams): [string, string][] {
  return Object.entries(search).flatMap(([key, value]) => {
    if (typeof value === "string") return [[key, value] as [string, string]];
    if (Array.isArray(value) && value.length > 0) return [[key, value[0]] as [string, string]];
    return [];
  });
}

/**
 * The current URL with some parameters changed.
 *
 * `page` is dropped BEFORE the changes are applied, which is what lets one
 * function serve both callers. A filter change has to reset the page, staying
 * on page 7 of a filter that now matches four events shows an empty page with
 * no way back, and a pagination link simply names the page it wants in the
 * changes, after the reset.
 *
 * Unknown parameters survive. A campaign tag or a referral code someone put on
 * the address is not this module's to throw away, and dropping it would break
 * attribution the moment a visitor touched a filter.
 */
export function patchParams(
  current: URLSearchParams,
  changes: Record<string, string | null>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  next.delete("page");
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  return next;
}

/** The 1-based page a query's offset lands on. */
export function pageOf(query: EventQuery): number {
  const limit = Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1);
  return Math.floor((query.offset ?? 0) / limit) + 1;
}

function isCategory(value: string | undefined): value is EventCategory {
  return value !== undefined && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

function isSort(value: string | undefined): value is EventSort {
  return value !== undefined && (EVENT_SORTS as readonly string[]).includes(value);
}

/**
 * A bounded integer, or the fallback.
 *
 * Anything that is not a finite number, "abc", "", "1e999", undefined, is the
 * fallback rather than an error, and anything out of range is pulled to the
 * nearest end rather than refused.
 */
function clamp<T extends number | undefined>(
  raw: string | undefined,
  fallback: T,
  low: number,
  high: number,
): number | T {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (value < low) return fallback;
  return Math.min(Math.floor(value), high);
}
