import { Link } from "@/i18n/routing";
import type { Locale } from "@/i18n/config";
import type { EventListing } from "@/lib/events/types";

import { EventCard } from "./event-card";

/**
 * One horizontal row of events.
 *
 * The landing page is built from these rather than from a grid, which is what
 * every marketplace of this kind converged on: a grid answers "show me
 * everything" and a rail answers "here is a reason to look". Somebody arriving
 * with no query has no query to answer, so the page offers angles — this
 * weekend, free, by category — instead of page one of four thousand.
 *
 * A scroller, not a carousel. No autoplay, no timed rotation, no hidden state:
 * it is a list that overflows, the cards are real links, and the scrollbar is
 * the affordance. A carousel that moves on its own hides most of its content
 * from anyone who is not watching it and from every crawler.
 */
export function EventRail({
  title,
  events,
  locale,
  href,
  seeAll,
  priority = false,
}: {
  title: string;
  events: EventListing[];
  locale: Locale;
  /** Where "see all" goes. The rail is a sample of a real filtered query. */
  href: string;
  seeAll: string;
  /** True only for the first rail, whose images are above the fold. */
  priority?: boolean;
}) {
  // A rail with nothing in it is not an empty state, it is a row that should
  // not be on the page. An organiser with no free events should not be shown a
  // "Free events" heading over a blank strip.
  if (events.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {title}
        </h2>
        <Link
          href={href}
          className="shrink-0 rounded-[--radius] text-sm font-medium text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {seeAll}
        </Link>
      </div>

      {/* Negative margin plus matching padding so the first card lines up with
          the page gutter while the row can still scroll edge to edge. Scroll
          snapping makes a flick land on a card boundary rather than halfway
          through one. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {events.map((event, index) => (
          <li
            key={event.id}
            className="w-[280px] shrink-0 snap-start sm:w-[320px]"
          >
            <EventCard event={event} locale={locale} priority={priority && index < 3} />
          </li>
        ))}
      </ul>
    </section>
  );
}
