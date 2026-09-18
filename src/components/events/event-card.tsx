import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/routing";
import type { EventListing } from "@/lib/events/types";
import { formatCardDateTime, formatMoney } from "@/lib/format";

import { EventImage, coverImage } from "./event-image";

/**
 * One card in the catalogue.
 *
 * THE POSTER IS THE CARD, and the words sit under it on the page rather than
 * inside a bordered box with it. Event artwork is already a designed rectangle
 * with its own frame, title and colour; putting a second frame around it and
 * then a panel of text inside that frame gives every row two competing edges
 * and shrinks the only thing a buyer actually scans by. Every marketplace of
 * this kind, Sympla, Eventbrite, DICE, drops the chrome for the same reason.
 *
 * The anatomy inside the text block follows what those same marketplaces
 * converged on, because a buyer scanning forty cards is using habits built
 * elsewhere:
 *
 * - TITLE FIRST. The date above it reads as a section heading and pushes the
 *   name out of the scan.
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
 *
 * Synchronous, and that is load-bearing: the rail renders the first cards on
 * the server and appends later ones in the browser from a server action, and
 * both paths use THIS component. An async card would have forced a second,
 * client-side copy of it, which is how two versions of the same card drift.
 */
export function EventCard({
  event,
  locale,
  priority = false,
}: {
  event: EventListing;
  locale: Locale;
  priority?: boolean;
}) {
  const t = useTranslations("catalogue");
  const cover = coverImage(event.media);
  const soldOut = event.availableTickets === 0 || event.fromPriceCents === null;
  const free = !soldOut && event.fromPriceCents === 0;

  return (
    <Link
      href={`/eventos/${event.slug}`}
      // The landmark a back navigation comes home to. Read by scroll-memory.tsx,
      // which returns the reader to the card they left through rather than to a
      // pixel offset that a reflow above it would have invalidated.
      data-event-id={event.id}
      className="group flex h-full flex-col rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div
        className="relative w-full overflow-hidden rounded-lg border border-border bg-muted"
        style={{ aspectRatio: "2 / 1" }}
      >
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

      <div className="flex flex-1 flex-col gap-0.5 pt-2.5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground underline-offset-2 group-hover:underline">
          {event.name}
        </h3>

        {/* A <time> with the machine-readable value on it, so what a person
            reads and what a crawler reads cannot drift apart. */}
        <p className="text-sm font-medium text-primary-ink">
          <time dateTime={event.startsAt}>{formatCardDateTime(event.startsAt, locale)}</time>
        </p>

        {/* Venue and city on ONE line. Two stacked muted lines under a title
            made the text block taller than it earns without the box around it
            to justify the space. */}
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {event.location.venue}
          {event.location.city ? ` · ${event.location.city}` : ""}
          {event.location.uf ? `, ${event.location.uf}` : ""}
        </p>

        <p className="mt-auto pt-1.5 text-sm font-semibold text-foreground">
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
    tone === "healthy" ? "bg-healthy text-healthy-foreground" : "bg-foreground text-background";
  return (
    <span
      className={`absolute left-2 top-2 rounded-[--radius] px-2 py-0.5 text-[11px] font-semibold ${skin}`}
    >
      {children}
    </span>
  );
}
