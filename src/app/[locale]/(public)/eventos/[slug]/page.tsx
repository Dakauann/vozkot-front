import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { brand } from "@/config/brand";
import { EventImage, coverImage } from "@/components/events/event-image";
import { EventLocationMap } from "@/components/events/event-location-map";
import { BuyPanel } from "@/components/events/buy-panel";
import { SeatedBuyPanel } from "@/components/events/seated-buy-panel";
import { SeatedTicketsCard } from "@/components/events/seated-tickets-card";
import { ArrowSquareOut, CalendarBlank, MapPin } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import { getEvent, getEventTiers } from "@/lib/events/api";
import { eventJsonLd } from "@/lib/events/structured-data";
import type { EventSummary } from "@/lib/events/types";
import { formatLongDateTime } from "@/lib/format";

/** Matches CHECKOUT_HOLD_TTL on the API. */
const HOLD_MINUTES = 30;
/**
 * The id the sidebar's button scrolls to, and the id the chart section carries.
 *
 * Named once so the two cannot drift: a button pointing at an anchor that moved
 * is a button that silently does nothing.
 */
const SEATS_ANCHOR = "lugares";

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const event = await getEvent(slug);
  if (!event) notFound();

  const [t, tiers] = await Promise.all([
    getTranslations("event"),
    getEventTiers(event.id),
  ]);
  const cover = coverImage(event.media);
  const cancelled = event.status === "cancelled";
  // Known HERE rather than probed in the browser. `salesMode` is on the event
  // response and binding a plan to a night is what sets it, so the page can be
  // laid out correctly on the server instead of rearranging itself once an
  // availability call comes back.
  const seated = event.salesMode === "seated";
  const hasCoordinates =
    typeof event.location.latitude === "number" &&
    Number.isFinite(event.location.latitude) &&
    typeof event.location.longitude === "number" &&
    Number.isFinite(event.location.longitude);

  const canonical = `${brand.siteUrl}/${locale}/eventos/${event.slug}`;

  return (
    <main className="w-full pb-14">
      {/* Rendered from the same values the page shows, never from a second
          source: markup that disagrees with the visible page is a manual
          action waiting to happen. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(eventJsonLd({ event, tiers, url: canonical })).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 pt-5 sm:px-6 lg:px-8 xl:px-10">
        {cancelled ? (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-ink"
          >
            {t("cancelled")}
          </p>
        ) : null}

        <section className="event-hero-enter overflow-hidden rounded-xl border border-border bg-card shadow-md">
          <div className="grid lg:grid-cols-[minmax(0,0.82fr)_minmax(520px,1.18fr)]">
            <div className="order-2 flex min-h-[330px] flex-col justify-between p-5 sm:p-8 lg:order-1 lg:min-h-[420px] lg:p-10">
              <div>
                <h1 className="mt-5 max-w-[16ch] font-display text-3xl font-semibold leading-[1.08] tracking-[-0.025em] text-foreground sm:text-4xl lg:text-[2.65rem]">
                  {event.name}
                </h1>
              </div>

              <dl className="mt-8 grid gap-5 border-t border-border pt-6">
                <HeroFact icon={CalendarBlank} label={t("when")}>
                  <time dateTime={event.startsAt}>
                    {formatLongDateTime(event.startsAt, locale)}
                  </time>
                  {event.endsAt ? (
                    <>
                      <span className="mx-1 text-border-strong" aria-hidden>
                        {"->"}
                      </span>
                      <time dateTime={event.endsAt}>
                        {formatLongDateTime(event.endsAt, locale)}
                      </time>
                    </>
                  ) : null}
                </HeroFact>
                <HeroFact icon={MapPin} label={t("where")}>
                  <span className="font-semibold text-foreground">{event.location.venue}</span>
                  <span className="block">{fullAddress(event)}</span>
                </HeroFact>
              </dl>
            </div>

            {/* The hero is the one image worth loading eagerly on this page. */}
            <div className="event-hero-media-enter relative order-1 aspect-[2/1] min-h-0 overflow-hidden bg-muted lg:order-2 lg:aspect-auto lg:min-h-[420px]">
              <EventImage
                media={cover}
                alt={event.name}
                priority
                sizes="(min-width: 1400px) 760px, (min-width: 1024px) 56vw, 100vw"
                className="h-full w-full object-cover"
                fallbackRatio={2}
              />
              <span
                className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10"
                aria-hidden
              />
            </div>
          </div>
        </section>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-10">
          <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {event.description ? (
              <section className="p-5 sm:p-7 lg:p-8" aria-labelledby="event-about-title">
                <SectionHeading id="event-about-title">
                  {t("about")}
                </SectionHeading>
                {/* Preserves the operator's line breaks without trusting their
                    markup: this remains plain text and cannot become stored XSS. */}
                <p className="mt-5 max-w-[72ch] whitespace-pre-line text-[15px] leading-7 text-muted-foreground">
                  {event.description}
                </p>
              </section>
            ) : null}

            <section
              className={event.description ? "border-t border-border" : undefined}
              id="location"
              aria-labelledby="event-location-title"
            >
              <div className="p-5 sm:p-7 lg:p-8">
                <SectionHeading id="event-location-title">
                  {t("location")}
                </SectionHeading>
                <div className="mt-5 flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-primary-ink">
                    <MapPin size={17} aria-hidden />
                  </span>
                  <p className="min-w-0 text-sm leading-6 text-muted-foreground">
                    <span className="block font-semibold text-foreground">{event.location.venue}</span>
                    {fullAddress(event)}
                    <span className="mt-1 block text-xs">{t("mapHint")}</span>
                  </p>
                </div>
              </div>

              {hasCoordinates ? (
                <div className="h-[320px] border-y border-border bg-muted sm:h-[380px]">
                  <EventLocationMap
                    latitude={event.location.latitude!}
                    longitude={event.location.longitude!}
                    label={t("mapPreview", { venue: event.location.venue })}
                  />
                </div>
              ) : null}

              {event.location.mapsUrl ? (
                <div className="flex flex-wrap gap-2 bg-muted/35 p-4 sm:px-7">
                  <MapLink href={event.location.mapsUrl}>{t("openInMaps")}</MapLink>
                  {event.location.wazeUrl ? (
                    <MapLink href={event.location.wazeUrl}>{t("openInWaze")}</MapLink>
                  ) : null}
                </div>
              ) : null}
            </section>
          </article>

          <aside className="w-full lg:sticky lg:top-24">
            <div className="mb-3 flex items-center gap-2">
              <span className="lamp" aria-hidden />
              <h2 className="font-display text-lg font-semibold text-foreground">{t("tickets")}</h2>
            </div>
            {cancelled ? (
              <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
                {t("cancelledNoSales")}
              </p>
            ) : seated ? (
              <SeatedTicketsCard tiers={tiers} locale={locale} anchor={SEATS_ANCHOR} />
            ) : (
              <BuyPanel
                eventId={event.id}
                tiers={tiers}
                eventSlug={event.slug}
                locale={locale}
                holdMinutes={HOLD_MINUTES}
              />
            )}
          </aside>
        </div>

        {/* The chart, at the width of the page.
            Below the fold on purpose: somebody who has not decided whether the
            price works for them has no use for a plan of the room, and the
            sidebar's button is what brings them here once they have.
            `scroll-mt` so the heading clears the sticky header rather than
            landing under it. */}
        {seated && !cancelled ? (
          <section id={SEATS_ANCHOR} className="mt-10 scroll-mt-24">
            <div className="mb-3 flex items-center gap-2">
              <span className="lamp" aria-hidden />
              <h2 className="font-display text-lg font-semibold text-foreground">
                {t("seatsHeading")}
              </h2>
            </div>
            <SeatedBuyPanel
              eventId={event.id}
              tiers={tiers}
              eventSlug={event.slug}
              locale={locale}
              holdMinutes={HOLD_MINUTES}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function HeroFact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
        <Icon size={17} aria-hidden className="self-center" />
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm leading-6 text-muted-foreground">{children}</dd>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-4 w-0.5 rounded-full bg-primary" aria-hidden />
      <h2 id={id} className="font-display text-xl font-semibold tracking-tight text-foreground">
        {children}
      </h2>
    </div>
  );
}

function MapLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-card px-3 text-sm font-medium text-foreground shadow-[var(--elev-button-quiet)] transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-accent-hover hover:shadow-[var(--elev-button-quiet-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowSquareOut size={14} aria-hidden />
    </a>
  );
}

function fullAddress(event: EventSummary): string {
  const { address, neighborhood, city, uf } = event.location;
  return [address, neighborhood, [city, uf].filter(Boolean).join(" - ")]
    .filter((part) => part && part.trim() !== "")
    .join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) return {};

  const cover = coverImage(event.media);
  const description =
    event.description.trim() !== ""
      ? event.description.slice(0, 200)
      : `${event.location.venue} · ${event.location.city}`;

  return {
    title: event.name,
    description,
    openGraph: {
      title: event.name,
      description,
      type: "website",
      images: cover ? [{ url: cover.url, width: cover.width, height: cover.height }] : undefined,
    },
  };
}
