import { describe, expect, it } from "vitest";

import {
  MAX_LINES,
  MAX_QUANTITY,
  intentParams,
  readIntent,
  safeNext,
  totalQuantity,
} from "./intent";

/**
 * The purchase intent survives a sign-in by living in the URL, so these tests
 * cover the three ways that can go wrong: losing the buyer's choice, letting a
 * hand-edited address do something it should not, and; the one that was a live
 * bug, quietly keeping only part of a basket.
 */

describe("readIntent", () => {
  it("reads a basket of several tiers", () => {
    expect(readIntent(new URLSearchParams("items=tier-1:2,tier-2:1&event=rock-in-rio"))).toEqual({
      lines: [
        { ticketId: "tier-1", quantity: 2 },
        { ticketId: "tier-2", quantity: 1 },
      ],
      eventSlug: "rock-in-rio",
    });
  });

  it("keeps every tier rather than the first", () => {
    // The regression this exists for: the buy panel let people choose three
    // tiers and checkout carried one, so the buyer paid for part of what they
    // picked and was never told about the rest.
    const intent = readIntent(new URLSearchParams("items=a:1,b:2,c:3"));
    expect(intent?.lines).toHaveLength(3);
    expect(totalQuantity(intent!.lines)).toBe(6);
  });

  it("treats the event slug as optional", () => {
    expect(readIntent(new URLSearchParams("items=tier-1:1"))).toEqual({
      lines: [{ ticketId: "tier-1", quantity: 1 }],
      eventSlug: undefined,
    });
  });

  it("reads a params object as well as URLSearchParams", () => {
    expect(readIntent({ items: "tier-1:3" })).toEqual({
      lines: [{ ticketId: "tier-1", quantity: 3 }],
      eventSlug: undefined,
    });
  });

  it("still reads the single-tier links sent before baskets existed", () => {
    // Links live in chat threads and confirmation emails for weeks.
    expect(readIntent(new URLSearchParams("ticket=tier-1&quantity=2&event=rock-in-rio"))).toEqual({
      lines: [{ ticketId: "tier-1", quantity: 2 }],
      eventSlug: "rock-in-rio",
    });
  });

  it("refuses an intent with no tier", () => {
    expect(readIntent(new URLSearchParams("event=rock-in-rio"))).toBeNull();
    expect(readIntent(new URLSearchParams("items="))).toBeNull();
    expect(readIntent(new URLSearchParams("items=%20%20"))).toBeNull();
    expect(readIntent(new URLSearchParams("items=:2"))).toBeNull();
  });

  it("refuses a quantity that is not a whole number of tickets", () => {
    for (const raw of ["tier-1:0", "tier-1:-1", "tier-1:1.5", "tier-1:abc", "tier-1:", "tier-1"]) {
      expect(readIntent(new URLSearchParams(`items=${raw}`)), raw).toBeNull();
    }
  });

  it("refuses more tickets than the API will sell in one order, across every tier", () => {
    // The cap counts the ORDER. Splitting a hoard across two tiers must not
    // buy anyone more room than asking for it on one.
    expect(readIntent(new URLSearchParams(`items=a:${MAX_QUANTITY}`))).not.toBeNull();
    expect(readIntent(new URLSearchParams(`items=a:${MAX_QUANTITY + 1}`))).toBeNull();
    expect(readIntent(new URLSearchParams(`items=a:${MAX_QUANTITY - 1},b:1`))).not.toBeNull();
    expect(readIntent(new URLSearchParams(`items=a:${MAX_QUANTITY},b:1`))).toBeNull();
  });

  it("refuses more tiers than one basket may span", () => {
    const tooMany = Array.from({ length: MAX_LINES + 1 }, (_, index) => `t${index}:1`).join(",");
    expect(readIntent(new URLSearchParams(`items=${tooMany}`))).toBeNull();
  });

  it("refuses a tier named twice rather than guessing which number was meant", () => {
    expect(readIntent(new URLSearchParams("items=tier-1:2,tier-1:3"))).toBeNull();
  });

  it("refuses rather than guessing when a link arrives truncated", () => {
    // A chat app that cuts a link short must produce "pick your tickets again",
    // never a checkout for something the buyer never chose.
    expect(readIntent(new URLSearchParams("items=tier-1:2,tier-2"))).toBeNull();
    expect(readIntent(new URLSearchParams("ticket=tier-1"))).toBeNull();
  });

  it("ignores a repeated parameter instead of concatenating it", () => {
    expect(readIntent({ items: ["a:1", "b:2"] })).toBeNull();
  });
});

describe("intentParams", () => {
  it("renders a basket back into parameters readIntent accepts", () => {
    const intent = {
      lines: [
        { ticketId: "tier-1", quantity: 2 },
        { ticketId: "tier-2", quantity: 1 },
      ],
      eventSlug: "rock-in-rio",
    };
    expect(readIntent(intentParams(intent))).toEqual(intent);
  });

  it("omits an absent event slug", () => {
    expect(intentParams({ lines: [{ ticketId: "tier-1", quantity: 2 }] }).has("event")).toBe(false);
  });

  it("escapes a tier id that would otherwise break the query string", () => {
    const intent = { lines: [{ ticketId: "tier&items=99:1", quantity: 1 }] };
    expect(readIntent(intentParams(intent))).toEqual({ ...intent, eventSlug: undefined });
  });

  it("survives a tier id containing the pair separator", () => {
    // Split on the LAST colon, so an id that contains one still parses.
    const intent = { lines: [{ ticketId: "tkt:weird:id", quantity: 3 }] };
    expect(readIntent(intentParams(intent))).toEqual({ ...intent, eventSlug: undefined });
  });
});

describe("safeNext", () => {
  it("allows a path on this site", () => {
    expect(safeNext("/checkout?items=tier-1:2")).toBe("/checkout?items=tier-1:2");
    expect(safeNext("/eventos/rock-in-rio")).toBe("/eventos/rock-in-rio");
  });

  it("falls back to the catalogue, which is the site root", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("honours a caller's own fallback", () => {
    expect(safeNext(null, "/eventos")).toBe("/eventos");
  });

  it("refuses anything that would leave the site", () => {
    // An open redirect on a login page is how a phishing link borrows a real
    // domain's credibility: the victim checks the address bar, sees the right
    // host, signs in, and is handed to the attacker afterwards.
    for (const hostile of [
      "https://evil.example",
      "http://evil.example",
      "//evil.example",
      "//evil.example/checkout",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "evil.example",
    ]) {
      expect(safeNext(hostile), hostile).toBe("/");
    }
  });

  it("refuses a backslash anywhere, because browsers normalise it to a slash", () => {
    expect(safeNext("/checkout\\@evil.example")).toBe("/");
  });
});

/**
 * Reserved seating in the URL.
 *
 * The chairs travel with the intent for the same reason the quantities do: a
 * buyer picks seats, signs in, and must come back to the same selection rather
 * than to an empty chart.
 */
describe("seated intents", () => {
  it("round-trips the chairs a buyer chose", () => {
    const intent = {
      lines: [{ ticketId: "tkt_a", quantity: 2, seatIds: ["ste_1", "ste_2"] }],
      eventSlug: "festival",
    };
    expect(readIntent(intentParams(intent))).toEqual(intent);
  });

  it("carries seated and counted lines in one basket", () => {
    const intent = {
      lines: [
        { ticketId: "tkt_pista", quantity: 3 },
        { ticketId: "tkt_plateia", quantity: 2, seatIds: ["ste_9", "ste_10"] },
      ],
      eventSlug: "mixed",
    };
    expect(readIntent(intentParams(intent))).toEqual(intent);
  });

  it("still survives a tier id containing the pair separator", () => {
    // The reason the parser reads from the right. A colon in an id is legal and
    // tested above for counted lines; adding seats must not break it.
    const intent = {
      lines: [{ ticketId: "tkt:weird:id", quantity: 1, seatIds: ["ste_1"] }],
      eventSlug: "odd",
    };
    expect(readIntent(intentParams(intent))).toEqual(intent);
  });

  it("refuses a line whose seat count disagrees with its quantity", () => {
    // A link that lost part of itself. Either number could be the one the buyer
    // meant, so neither is used, the server refuses it for the same reason.
    expect(readIntent(new URLSearchParams({ items: "tkt_a:3@ste_1+ste_2" }))).toBeNull();
    expect(readIntent(new URLSearchParams({ items: "tkt_a:1@ste_1+ste_2" }))).toBeNull();
  });

  it("refuses the same chair twice", () => {
    expect(readIntent(new URLSearchParams({ items: "tkt_a:2@ste_1+ste_1" }))).toBeNull();
  });

  it("refuses an empty seat group", () => {
    expect(readIntent(new URLSearchParams({ items: "tkt_a:1@" }))).toBeNull();
  });

  it("keeps a counted line free of a seats key", () => {
    // Not cosmetic: the API treats the PRESENCE of seatIds as "this line is
    // seated", so an empty array on a counted line would claim nothing and
    // refuse the purchase.
    const parsed = readIntent(new URLSearchParams({ items: "tkt_a:2" }));
    expect(parsed?.lines[0]).not.toHaveProperty("seatIds");
  });
});
