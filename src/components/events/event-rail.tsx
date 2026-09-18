import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import type { Locale } from "@/i18n/config";
import { listEvents } from "@/lib/events/api";
import type { EventQuery } from "@/lib/events/types";

import { EventCard } from "./event-card";
import { RailScroller } from "./rail-scroller";

/** One screenful plus a little, so the row overflows and reads as scrollable. */
export const RAIL_PAGE = 8;

/**
 * One horizontal row of events.
 *
 * The landing page is built from these rather than from a grid, which is what
 * every marketplace of this kind converged on: a grid answers "show me
 * everything" and a rail answers "here is a reason to look". Somebody arriving
 * with no query has no query to answer, so the page offers angles, this
 * weekend, free, by category, instead of page one of four thousand.
 *
 * THE RAIL OWNS ITS QUERY. It used to be handed a finished array, which meant
 * the page had to await every rail before it could send anything, and it asked
 * each of them for twelve events whether or not anyone scrolled. Now it fetches
 * its own first page, so the page can wrap it in Suspense and stream it, and
 * the scroller asks for the rest only when somebody reaches the end of it.
 */
export async function EventRail({
  title,
  query,
  locale,
  href,
  priority = false,
}: {
  title: string;
  /** The rail's angle. The same shape is replayed by the load-more action. */
  query: Pick<EventQuery, "sort" | "from" | "until" | "free" | "available" | "category">;
  locale: Locale;
  /** Where "see all" goes. The rail is a sample of a real filtered query. */
  href: string;
  /** True only for the first rail, whose images are above the fold. */
  priority?: boolean;
}) {
  const t = await getTranslations("catalogue");
  const page = await listEvents({ ...query, limit: RAIL_PAGE });

  // A rail with nothing in it is not an empty state, it is a row that should
  // not be on the page. An organiser with no free events should not be shown a
  // "Free events" heading over a blank strip.
  if (page.data.length === 0) return null;

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
          {t("seeAll")}
        </Link>
      </div>

      <RailScroller
        query={query}
        locale={locale}
        loaded={page.data.length}
        total={page.total}
        pageSize={RAIL_PAGE}
      >
        {page.data.map((event, index) => (
          <li key={event.id} className="w-[264px] shrink-0 snap-start sm:w-[300px]">
            <EventCard event={event} locale={locale} priority={priority && index < 3} />
          </li>
        ))}
      </RailScroller>
    </section>
  );
}

/**
 * The shape a rail holds while its query is in flight.
 *
 * Sized from the same numbers the real row uses, so streaming one in does not
 * move the rows beneath it: the whole point of streaming is lost if the page
 * jumps as each one lands.
 */
export function RailSkeleton() {
  return (
    <section className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-7 w-52 rounded-[--radius] bg-muted" />
      <ul className="-mx-4 flex gap-4 overflow-hidden px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className="w-[264px] shrink-0 sm:w-[300px]">
            <div className="w-full rounded-lg bg-muted" style={{ aspectRatio: "2 / 1" }} />
            <div className="mt-2.5 h-4 w-4/5 rounded-[--radius] bg-muted" />
            <div className="mt-1.5 h-3.5 w-1/2 rounded-[--radius] bg-muted" />
            <div className="mt-1.5 h-3.5 w-2/3 rounded-[--radius] bg-muted" />
          </li>
        ))}
      </ul>
    </section>
  );
}
