import { describe, expect, it } from "vitest";

import { eventJsonLd } from "./structured-data";
import type { EventSummary, TicketTier } from "./types";

/**
 * Structured data is invisible, which is exactly why it needs tests: nobody
 * notices it is wrong by looking at the page, and the failure mode is a search
 * result that quietly says the wrong price or claims a cancelled event is on.
 */

const EVENT: EventSummary = {
  id: "evt_1",
  slug: "festival-aurora",
  name: "Festival Aurora",
  description: "Duas noites de música.",
  category: "festas_shows",
  location: {
    venue: "Arena Castelão",
    address: "Av. Alberto Craveiro, 2901",
    neighborhood: "Castelão",
    city: "Fortaleza",
    uf: "CE",
    postalCode: "60861-630",
    latitude: -3.807,
    longitude: -38.522,
  },
  startsAt: "2026-11-15T22:00:00.000Z",
  endsAt: "2026-11-16T04:00:00.000Z",
  status: "published",
  media: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function tier(overrides: Partial<TicketTier> = {}): TicketTier {
  return {
    id: "tkt_1",
    eventId: "evt_1",
    title: "Pista",
    description: "",
    priceCents: 2400,
    currency: "BRL",
    quantity: 100,
    sold: 0,
    available: 100,
    status: "on_sale",
    ...overrides,
  };
}

const URL = "https://example.com/pt/eventos/festival-aurora";

describe("eventJsonLd", () => {
  it("produces a valid Event with the fields a result needs", () => {
    const data = eventJsonLd({ event: EVENT, tiers: [tier()], url: URL });

    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("Event");
    expect(data.name).toBe("Festival Aurora");
    expect(data.startDate).toBe(EVENT.startsAt);
    expect(data.endDate).toBe(EVENT.endsAt);
    expect(data.url).toBe(URL);
    expect(data.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(data.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
  });

  it("prices in reais, not centavos", () => {
    // The whole point. Sending 2400 for R$ 24,00 makes every listing look a
    // hundred times more expensive than it is.
    const data = eventJsonLd({ event: EVENT, tiers: [tier({ priceCents: 2400 })], url: URL });
    const offers = data.offers as { price: string; priceCurrency: string }[];
    expect(offers[0].price).toBe("24.00");
    expect(offers[0].priceCurrency).toBe("BRL");
    expect(data.lowPrice).toBe("24.00");
  });

  it("reports the cheapest tier still on sale as the low price", () => {
    const data = eventJsonLd({
      event: EVENT,
      tiers: [
        tier({ id: "a", priceCents: 12000 }),
        tier({ id: "b", priceCents: 4000 }),
        // Sold out, so it must not set the low price even though it is cheapest.
        tier({ id: "c", priceCents: 1000, available: 0, status: "sold_out" }),
      ],
      url: URL,
    });
    expect(data.lowPrice).toBe("40.00");
  });

  it("marks a sold-out tier as sold out", () => {
    const data = eventJsonLd({
      event: EVENT,
      tiers: [tier({ available: 0, status: "sold_out" })],
      url: URL,
    });
    const offers = data.offers as { availability: string }[];
    expect(offers[0].availability).toBe("https://schema.org/SoldOut");
    // No tier on sale, so nothing to claim a price from.
    expect(data.lowPrice).toBeUndefined();
  });

  it("says an event is cancelled when it is", () => {
    // Leaving this as EventScheduled sends people to a cancelled show.
    const data = eventJsonLd({
      event: { ...EVENT, status: "cancelled" },
      tiers: [],
      url: URL,
    });
    expect(data.eventStatus).toBe("https://schema.org/EventCancelled");
  });

  it("carries the address and the coordinates", () => {
    const data = eventJsonLd({ event: EVENT, tiers: [], url: URL });
    const place = data.location as {
      name: string;
      address: Record<string, string>;
      geo?: { latitude: number; longitude: number };
    };
    expect(place.name).toBe("Arena Castelão");
    expect(place.address.addressLocality).toBe("Fortaleza");
    expect(place.address.addressRegion).toBe("CE");
    expect(place.address.addressCountry).toBe("BR");
    expect(place.geo?.latitude).toBe(-3.807);
  });

  it("omits geo entirely when the event has no pin", () => {
    // Half a coordinate, or a zero standing in for a missing one, would put the
    // venue in the Atlantic on every map that reads this.
    const data = eventJsonLd({
      event: {
        ...EVENT,
        location: { ...EVENT.location, latitude: undefined, longitude: undefined },
      },
      tiers: [],
      url: URL,
    });
    expect((data.location as Record<string, unknown>).geo).toBeUndefined();
  });

  it("omits an empty description rather than asserting an empty one", () => {
    const data = eventJsonLd({ event: { ...EVENT, description: "   " }, tiers: [], url: URL });
    expect(data.description).toBeUndefined();
  });

  it("omits endDate when the event has no end", () => {
    const data = eventJsonLd({ event: { ...EVENT, endsAt: undefined }, tiers: [], url: URL });
    expect(data.endDate).toBeUndefined();
  });

  it("serialises to JSON with nothing that can break out of a script tag", () => {
    const hostile = { ...EVENT, name: "</script><script>alert(1)</script>" };
    const json = JSON.stringify(eventJsonLd({ event: hostile, tiers: [], url: URL })).replace(
      /</g,
      "\\u003c",
    );
    expect(json).not.toContain("</script>");
    expect(json).not.toContain("<");
    // Still the same data once parsed: escaping must not corrupt the payload.
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });
});
