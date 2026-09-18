"use client";

import * as React from "react";

import { SeatedBuyPanel } from "@/components/events/seated-buy-panel";
import { TierPicker } from "@/components/events/tier-picker";
import type { Locale } from "@/i18n/config";
import { fetchAvailability } from "@/lib/seating/api";
import type { TicketTier } from "@/lib/events/types";

/**
 * Which buy panel this event gets.
 *
 * A client component on purpose, and the reason is caching. The event page is
 * server-rendered and cacheable: the name, the venue, the date and the poster
 * do not change between two visitors, and seat status changes every second of
 * an onsale. Deciding here keeps the map out of that cached HTML entirely,
 * because a cached seat map is a map that shows sold chairs as free.
 *
 * The decision itself is one indexed query: does this event have seats. A
 * general-admission event answers with an empty list and renders exactly the
 * panel it always did.
 */
export function BuyPanel({
  eventId,
  tiers,
  eventSlug,
  locale,
  holdMinutes,
}: {
  eventId: string;
  tiers: TicketTier[];
  eventSlug: string;
  locale: Locale;
  holdMinutes: number;
}) {
  // null while unknown. The counted panel is NOT rendered in the meantime:
  // flashing a quantity stepper at somebody who is about to be given a seat
  // map, and who might tap it first, would take them to a checkout for the
  // wrong thing.
  const [seated, setSeated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let live = true;
    fetchAvailability(eventId).then((sectors) => {
      if (live) setSeated(sectors.length > 0);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  if (seated === null) {
    // The height of the panel it is about to become, so the page does not jump
    // when the answer arrives.
    return (
      <div
        className="h-[280px] animate-pulse rounded-lg border border-border bg-card"
        aria-hidden="true"
      />
    );
  }

  if (seated) {
    return (
      <SeatedBuyPanel
        eventId={eventId}
        tiers={tiers}
        eventSlug={eventSlug}
        locale={locale}
        holdMinutes={holdMinutes}
      />
    );
  }

  return (
    <TierPicker
      tiers={tiers}
      eventSlug={eventSlug}
      locale={locale}
      holdMinutes={holdMinutes}
    />
  );
}
