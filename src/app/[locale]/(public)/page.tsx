import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CatalogueFilters } from "@/components/events/catalogue-filters";
import { CollectionStrip } from "@/components/events/collection-strip";
import { EventCard } from "@/components/events/event-card";
import { EventRail } from "@/components/events/event-rail";
import {
  FeaturedCarousel,
  type FeaturedSlide,
} from "@/components/events/featured-carousel";
import { coverImage } from "@/components/events/event-image";
import { OrganiserBand } from "@/components/events/organiser-band";
import { Pagination } from "@/components/events/pagination";
import type { Locale } from "@/i18n/config";
import { getCatalogueFilters, listEvents } from "@/lib/events/api";
import { parseEventQuery, type SearchParams } from "@/lib/events/query";
import { MAX_OFFSET, type EventListing } from "@/lib/events/types";

/**
 * The landing page, which is also the results page.
 *
 * ONE route with two faces, and the split is the whole design:
 *
 * - With no query, this is a landing page made of RAILS. Somebody who has not
 *   asked for anything has no query to answer, so the page offers angles:
 *   soonest, this weekend, free, by category, rather than page one of four
 *   thousand events sorted by a rule they did not choose. Every marketplace
 *   worth copying does this: none of them open on a grid.
 * - The moment anything is asked for, it becomes a GRID with pagination. The
 *   buyer has stated an intent and the only respectful answer is the matches.
 *
 * Keeping both on `/` rather than splitting them across two routes means a
 * search from the landing page does not change address, the back button goes
 * where people expect, and there is one canonical URL for the catalogue instead
 * of two that compete for the same searches.
 *
 * A server component throughout. The filters, the search terms and the page
 * number all live in the URL, so the page is a pure function of its address: it
 * renders as HTML a crawler can read and a slow phone can paint before any
 * JavaScript arrives.
 */
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;

  const query = parseEventQuery(search);
  const browsing =
    query.q === undefined &&
    query.category === undefined &&
    query.city === undefined &&
    query.free === undefined &&
    query.available === undefined &&
    (query.offset ?? 0) === 0;

  return browsing ? (
    <Landing locale={locale} />
  ) : (
    <Results locale={locale} query={query} search={search} />
  );
}

/**
 * The landing page: one featured night, ways in, then rails.
 *
 * The order is the whole argument. A visitor who has asked for nothing gets
 * something SPECIFIC first: a real event, with its poster, its date and its
 * price, because a page that opens on navigation asks them to make a decision
 * before showing them anything worth deciding about. The ways in come second,
 * for the visitor who does have a shape in mind. The rails come last, and are
 * the bulk of the page.
 *
 * Everything here is server-rendered from real queries. There is no editorial
 * "featured" flag behind the hero: it is the soonest event that still has
 * tickets, which is a fact rather than a decision somebody has to remember to
 * keep current.
 */
async function Landing({ locale }: { locale: Locale }) {
  const t = await getTranslations("catalogue");
  const { start, end } = weekend();

  // Every rail and the filter options in one round of requests. Sequential
  // fetches here would stack four API latencies into the time to first byte.
  const [filters, soonest, thisWeekend, free] = await Promise.all([
    getCatalogueFilters(),
    listEvents({ sort: "starts_at", available: true, limit: 12 }),
    listEvents({ sort: "starts_at", from: start, until: end, limit: 12 }),
    listEvents({ sort: "starts_at", free: true, limit: 12 }),
  ]);

  // The featured row and the first rail come from the same query rather than
  // two, and the rail then skips what the row is already showing, a landing
  // page whose first two elements are the same events looks broken.
  //
  // "Featured" is the soonest events that still have tickets. That is a fact
  // the query computes on every render, not an editorial flag somebody has to
  // remember to keep current, which is the version that eventually promotes a
  // show that happened last month.
  const featured = soonest.data.slice(0, FEATURED_COUNT);
  const rest = soonest.data.slice(FEATURED_COUNT);

  if (soonest.total === 0) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <EmptyCatalogue />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-10">
        {featured.length > 0 ? (
          <FeaturedCarousel slides={featured.map(toSlide)} locale={locale} />
        ) : null}

        <CollectionStrip filters={filters} />

        <EventRail
          title={t("rails.soonest")}
          events={rest}
          locale={locale}
          href="/?available=true&sort=starts_at"
          seeAll={t("seeAll")}
        />

        <EventRail
          title={t("rails.weekend")}
          events={thisWeekend.data}
          locale={locale}
          href={`/?from=${start}&until=${end}&sort=starts_at`}
          seeAll={t("seeAll")}
        />

        <EventRail
          title={t("rails.free")}
          events={free.data}
          locale={locale}
          href="/?free=true&sort=starts_at"
          seeAll={t("seeAll")}
        />

        <OrganiserBand />
      </div>
    </main>
  );
}

/**
 * How many posters the featured row holds.
 *
 * Five: enough that the row keeps moving somewhere new for half a minute, few
 * enough that every one of them is a genuinely imminent event rather than
 * whatever was needed to fill the track.
 */
const FEATURED_COUNT = 5;

/**
 * An event, flattened to what the carousel needs.
 *
 * Done here, on the server, so the client component ships no catalogue types
 * and no image-picking rules, and so the slide carries the cover's real pixel
 * dimensions, which is what lets the browser reserve the box before the bytes
 * arrive.
 */
function toSlide(event: EventListing): FeaturedSlide {
  const cover = coverImage(event.media);
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    startsAt: event.startsAt,
    city: event.location.city,
    uf: event.location.uf,
    venue: event.location.venue,
    fromPriceCents: event.fromPriceCents,
    soldOut: event.availableTickets === 0 || event.fromPriceCents === null,
    coverUrl: cover?.url,
    blurDataUrl: cover?.blurDataUrl,
    width: cover?.width,
    height: cover?.height,
  };
}

/** The grid. */
async function Results({
  locale,
  query,
  search,
}: {
  locale: Locale;
  query: ReturnType<typeof parseEventQuery>;
  search: SearchParams;
}) {
  const t = await getTranslations("catalogue");
  const [page, filters] = await Promise.all([listEvents(query), getCatalogueFilters()]);

  const first = page.total === 0 ? 0 : page.offset + 1;
  const last = page.offset + page.data.length;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <CatalogueFilters options={filters} />

      <p className="py-4 text-sm text-muted-foreground" role="status" aria-live="polite">
        {page.total === 0 ? t("noResults") : t("showing", { first, last, total: page.total })}
      </p>

      {page.total === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* 1 / 2 / 3 / 4 columns, at the widths where a 2:1 card stops being
              readable rather than at device names. The gap opens up from 16 to
              24px once there is more than one column to separate. */}
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {page.data.map((event, index) => (
              <li key={event.id} className="flex">
                {/* Only the first row is eager. Marking every card priority
                    makes them compete and none of them arrives sooner. */}
                <EventCard event={event} locale={locale} priority={index < 4} />
              </li>
            ))}
          </ul>

          <div className="pt-8">
            <Pagination
              total={page.total}
              limit={page.limit}
              offset={page.offset}
              searchParams={search}
              maxOffset={MAX_OFFSET}
            />
          </div>
        </>
      )}
    </main>
  );
}

async function EmptyState() {
  const t = await getTranslations("catalogue");
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold text-card-foreground">{t("emptyTitle")}</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">{t("emptyBody")}</p>
    </div>
  );
}

async function EmptyCatalogue() {
  const t = await getTranslations("catalogue");
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold text-card-foreground">{t("emptyTitle")}</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">
        {t("emptyCatalogue")}
      </p>
    </div>
  );
}

/**
 * This weekend, as ISO instants the API can filter on.
 *
 * Friday 18:00 through Sunday end of day, which is what "the weekend" means to
 * somebody looking for something to do rather than to a calendar. Computed on
 * the server, so every visitor sees the same window regardless of their clock.
 */
function weekend(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay(); // 0 Sunday … 6 Saturday
  const untilFriday = (5 - day + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() + untilFriday);
  start.setHours(18, 0, 0, 0);
  // Already past Friday evening: the weekend under way is the one meant, not
  // the next one.
  if (untilFriday === 0 && now.getHours() >= 18) start.setTime(now.getTime());
  if (day === 0 || day === 6) start.setTime(now.getTime());

  const end = new Date(start);
  end.setDate(start.getDate() + (7 - ((start.getDay() + 1) % 7)) % 7);
  end.setHours(23, 59, 59, 999);
  // Never an empty window, whatever the arithmetic above produced.
  if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 3 * 24 * 3600 * 1000);

  return { start: start.toISOString(), end: end.toISOString() };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "catalogue" });
  return { title: t("title"), description: t("subtitle") };
}
