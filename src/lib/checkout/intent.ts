/**
 * The purchase a buyer has chosen but not yet placed.
 *
 * It travels in the URL, and that is the whole design. Checkout may require a
 * sign-in, and a sign-in is a navigation: possibly to another tab, possibly
 * back the next morning from a link in an email. Anything held in React state,
 * or in a store, is gone by then, and a buyer who has just chosen two Camarote
 * tickets and signed in should not land on an empty page and have to choose
 * again.
 *
 * A URL survives a redirect, a refresh, a shared link, a restored tab and the
 * back button. It is also inspectable, which matters more than it sounds:
 * nothing here is trusted. Each tier id names a row the server re-reads, every
 * quantity is re-validated against real stock, and no price is in the URL at
 * all; a buyer who edits it changes nothing, because the amount is computed
 * from the tiers the server looked up.
 */

/** One tier and how many of it. */
export interface IntentLine {
  ticketId: string;
  quantity: number;
}

export interface CheckoutIntent {
  /**
   * The basket. Several tiers of ONE event, which is what the buy panel has
   * always let people choose and what checkout now actually honours.
   */
  lines: IntentLine[];
  /** Where to send the buyer back to if they abandon or a tier is gone. */
  eventSlug?: string;
}

/** The API refuses more than this per order, counting every tier, so the parser does too. */
export const MAX_QUANTITY = 10;

/** And no more tiers than this in one basket. */
export const MAX_LINES = 10;

/**
 * The query parameter carrying the basket.
 *
 * One parameter holding `tierId:quantity` pairs rather than repeated `ticket=`
 * and `quantity=` pairs, because repeated parameters can be reordered or
 * partially dropped in transit and would silently pair the wrong quantity with
 * the wrong tier. Keeping each pair welded together makes a mangled link
 * unparseable instead of wrong, and "pick your tickets again" is a far better
 * outcome than a checkout for something the buyer did not choose.
 */
const ITEMS_PARAM = "items";

/**
 * Reads an intent out of query parameters, or returns null.
 *
 * Null rather than a thrown error or a partially filled object: a malformed
 * link: truncated by a chat app, hand-edited, from an older version of the
 * site; should show "pick your tickets again" rather than a stack trace or,
 * worse, a checkout for one ticket the buyer never chose.
 */
export function readIntent(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): CheckoutIntent | null {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const lines = parseLines(get(ITEMS_PARAM)) ?? parseLegacy(get("ticket"), get("quantity"));
  if (!lines) return null;

  const eventSlug = get("event")?.trim();
  return { lines, eventSlug: eventSlug || undefined };
}

/** `tkt_a:2,tkt_b:1` */
function parseLines(raw: string | undefined): IntentLine[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const lines: IntentLine[] = [];
  const seen = new Set<string>();
  for (const pair of trimmed.split(",")) {
    const separator = pair.lastIndexOf(":");
    if (separator <= 0) return null;
    const ticketId = pair.slice(0, separator).trim();
    const quantity = Number(pair.slice(separator + 1));
    if (!ticketId) return null;
    if (!Number.isInteger(quantity) || quantity < 1) return null;
    // A tier named twice is a link that has been edited or merged, and the
    // honest response is to refuse it rather than to guess which number was
    // meant. The server merges duplicates it is sent; the URL should not carry
    // any.
    if (seen.has(ticketId)) return null;
    seen.add(ticketId);
    lines.push({ ticketId, quantity });
  }

  if (lines.length === 0 || lines.length > MAX_LINES) return null;
  if (totalQuantity(lines) > MAX_QUANTITY) return null;
  return lines;
}

/**
 * The old single-tier shape, still accepted.
 *
 * Links live in chat threads and confirmation emails for weeks. One that was
 * sent before the basket existed should still open the checkout it meant.
 */
function parseLegacy(ticketId: string | undefined, rawQuantity: string | undefined): IntentLine[] | null {
  const id = ticketId?.trim();
  if (!id) return null;
  const quantity = Number(rawQuantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
  return [{ ticketId: id, quantity }];
}

/** How many tickets the basket covers, across every tier. */
export function totalQuantity(lines: IntentLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Renders an intent back into query parameters. */
export function intentParams(intent: CheckoutIntent): URLSearchParams {
  const params = new URLSearchParams({
    [ITEMS_PARAM]: intent.lines.map((line) => `${line.ticketId}:${line.quantity}`).join(","),
  });
  if (intent.eventSlug) params.set("event", intent.eventSlug);
  return params;
}

/**
 * Validates a `next` parameter before redirecting to it.
 *
 * Only a path on this site. Anything with a scheme, a host, or a protocol-
 * relative "//" prefix is refused and replaced with the catalogue.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return fallback;
  // "//evil.com" is protocol-relative and would leave the site.
  if (trimmed.startsWith("//")) return fallback;
  // A backslash is normalised to a slash by some browsers, so "/\evil.com"
  // becomes "//evil.com".
  if (trimmed.includes("\\")) return fallback;
  return trimmed;
}
