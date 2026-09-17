import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { TicketTier } from "@/lib/events/types";
import { formatMoney } from "@/lib/format";

/**
 * The ticket panel for a night that sells named chairs.
 *
 * It says what the night costs and sends the buyer to the map, and it does not
 * try to BE the map. A seat chart belongs at the width of the page: the sidebar
 * it used to live in is 400px, which left a theatre of 222 chairs rendering as
 * a column of dots with its own legend stacked one word per line beside it.
 *
 * So the sidebar keeps the job it is the right shape for, which is answering
 * "how much" in one line and offering one button, and the chart gets the full
 * width further down. Every reserved-seating site converges on this split, and
 * on this order: the price decides whether somebody is still interested, and
 * only then is a chart worth drawing.
 *
 * A plain anchor rather than a click handler, so it works before the page has
 * hydrated and lands on a heading rather than on a scroll position.
 */
export async function SeatedTicketsCard({
  tiers,
  locale,
  anchor,
}: {
  tiers: TicketTier[];
  locale: Locale;
  /** The id of the section holding the chart, which this scrolls to. */
  anchor: string;
}) {
  const t = await getTranslations("event");
  if (tiers.length === 0) return null;

  const currency = tiers[0]?.currency ?? "BRL";
  const prices = tiers.map((tier) => tier.priceCents);
  const cheapest = Math.min(...prices);
  const dearest = Math.max(...prices);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {/* A range, or one price when the house sells at one. "Entre R$ 60 e
          R$ 60" is the kind of sentence that makes a page look automated. */}
      <p className="text-sm text-muted-foreground">
        {cheapest === dearest
          ? t("priceOne", { price: formatMoney(cheapest, locale, currency) })
          : t("priceRange", {
              from: formatMoney(cheapest, locale, currency),
              to: formatMoney(dearest, locale, currency),
            })}
      </p>

      <Button asChild className="mt-3 w-full">
        <a href={`#${anchor}`}>{t("chooseSeats")}</a>
      </Button>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("chooseSeatsHint")}</p>
    </div>
  );
}
