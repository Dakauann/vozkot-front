import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/routing";
import type { EventListing } from "@/lib/events/types";
import { formatCardDateTime, formatMoney } from "@/lib/format";

import { EventImage, coverImage } from "./event-image";

/**
 * One card in the catalogue.
 *
 * The anatomy follows what the marketplaces converged on rather than what looks
 * balanced in isolation, because a buyer scanning forty cards is using habits
 * built elsewhere:
 *
 * - TITLE FIRST. Eventbrite, DICE and Sympla all lead with the name; the date
 *   above it reads as a section heading and pushes the name out of the scan.
 * - Then DATE, then VENUE, then CITY. Date outranks venue because it is the
 *   filter people hold in their head while browsing.
 * - Then PRICE, always. Sympla is the outlier that omits it, and omitting it
 *   forces a click to answer the first question every buyer has.
 * - A 2:1 image, which is Eventbrite's published artwork spec and fits event
 *   posters better than a square while showing more cards per screen.
 *
 * The whole card is one link rather than a card containing one. A grid where
 * only the title is clickable is a grid people miss by a few pixels every time,
 * and a nested interactive element inside a link is invalid markup that screen
 * readers announce twice.
 */
export async function EventCard({
  event,
  locale,
  priority = false,
}: {
  event: EventListing;
  locale: Locale;
  priority?: boolean;
}) {
  const t = await getTranslations("catalogue");
  const cover = coverImage(event.media);
  const soldOut = event.availableTickets === 0 || event.fromPriceCents === null;
  const free = !soldOut && event.fromPriceCents === 0;

  return (
    <Link
      href={`/eventos/${event.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-[var(--elev-button-quiet-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio: "2 / 1" }}>
        <EventImage
          media={cover}
          alt={event.name}
          priority={priority}
          // Four columns on a wide screen, two on a tablet, one on a phone.
          // Without this the browser assumes the image fills the viewport and
          // fetches the 1600px variant for a 280px box.
          sizes="(max-width: 420px) 100vw, (max-width: 768px) 50vw, (max-width: 992px) 33vw, 25vw"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {/* One badge at most. Two competing flags on a card is noise, and the
            state that stops a sale outranks the one that encourages it. */}
        {soldOut ? (
          <Badge tone="muted">{t("soldOut")}</Badge>
        ) : free ? (
          <Badge tone="healthy">{t("free")}</Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-card-foreground">
          {event.name}
        </h3>

        {/* A <time> with the machine-readable value on it, so what a person
            reads and what a crawler reads cannot drift apart. */}
        <p className="text-sm font-medium text-primary-ink">
          <time dateTime={event.startsAt}>{formatCardDateTime(event.startsAt, locale)}</time>
        </p>

        <p className="line-clamp-1 text-sm text-muted-foreground">{event.location.venue}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {event.location.city}
          {event.location.uf ? `, ${event.location.uf}` : ""}
        </p>

        <p className="mt-auto pt-2 text-sm font-semibold text-card-foreground">
          {soldOut
            ? t("soldOut")
            : free
              ? t("free")
              : t("fromPrice", { price: formatMoney(event.fromPriceCents!, locale) })}
        </p>
      </div>
    </Link>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "muted" | "healthy" }) {
  const skin =
    tone === "healthy"
      ? "bg-healthy text-healthy-foreground"
      : "bg-foreground text-background";
  return (
    <span
      className={`absolute left-0 top-3 rounded-r-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${skin}`}
    >
      {children}
    </span>
  );
}
