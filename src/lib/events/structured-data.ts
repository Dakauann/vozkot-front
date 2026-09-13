import type { EventSummary, TicketTier } from "./types";

/**
 * schema.org Event markup.
 *
 * The highest-leverage thing on an event page that nobody ever sees. Google
 * publishes an Eventbrite case study putting the effect of Event structured
 * data at roughly a doubling of the year-on-year growth in search traffic to
 * their listing pages, because it is what turns a blue link into a result with
 * a date, a venue and a price attached.
 *
 * Generated from the same values the page renders, never from a second source.
 * Markup that disagrees with the visible page is a manual action waiting to
 * happen, and Google's own guidance is explicit that the two must match.
 */

/** What the API tells us, mapped to what schema.org expects. */
const AVAILABILITY = {
  onSale: "https://schema.org/InStock",
  soldOut: "https://schema.org/SoldOut",
} as const;

export function eventJsonLd({
  event,
  tiers,
  url,
}: {
  event: EventSummary;
  tiers: TicketTier[];
  /** The canonical, absolute URL of this event's page. */
  url: string;
}): Record<string, unknown> {
  const onSale = tiers.filter((tier) => tier.status === "on_sale" && tier.available > 0);
  const cheapest = onSale.reduce<TicketTier | null>(
    (lowest, tier) => (lowest === null || tier.priceCents < lowest.priceCents ? tier : lowest),
    null,
  );

  const location = event.location;
  const hasCoordinates = location.latitude !== undefined && location.longitude !== undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    // Absent rather than empty: an empty description is worse than no field,
    // because it asserts that the event has nothing to say about itself.
    ...(event.description.trim() !== "" ? { description: event.description } : {}),
    startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}),
    eventStatus:
      event.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    // Every event here is a physical one. An online event would need
    // OnlineEventAttendanceMode and a url instead of a place.
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    ...(event.media.length > 0 ? { image: event.media.map((item) => item.url) } : {}),
    location: {
      "@type": "Place",
      name: location.venue,
      address: {
        "@type": "PostalAddress",
        streetAddress: location.address,
        addressLocality: location.city,
        addressRegion: location.uf,
        postalCode: location.postalCode,
        addressCountry: "BR",
      },
      ...(hasCoordinates
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: location.latitude,
              longitude: location.longitude,
            },
          }
        : {}),
    },
    // One offer per tier, which is what lets a result show "from R$ 24" rather
    // than a single price that is wrong for everyone who buys a different tier.
    offers: tiers.map((tier) => ({
      "@type": "Offer",
      name: tier.title,
      url,
      // Reais, not centavos. schema.org wants a decimal amount, and sending
      // 2400 for R$ 24,00 is the mistake that makes a listing look expensive.
      price: (tier.priceCents / 100).toFixed(2),
      priceCurrency: tier.currency,
      availability:
        tier.status === "on_sale" && tier.available > 0
          ? AVAILABILITY.onSale
          : AVAILABILITY.soldOut,
      validFrom: event.createdAt,
    })),
    ...(cheapest
      ? {
          // A single low price alongside the offers, because that is the field
          // most result formats actually read.
          lowPrice: (cheapest.priceCents / 100).toFixed(2),
          priceCurrency: cheapest.currency,
        }
      : {}),
  };
}
