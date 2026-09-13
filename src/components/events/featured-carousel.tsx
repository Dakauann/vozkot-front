"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useTranslations } from "next-intl";

import { CaretLeft, CaretRight, CalendarBlank, MapPin } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/routing";
import { formatCardDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** How long a slide holds before the next one takes over. */
const ADVANCE_MS = 6000;

/** One slide, flattened by the server so this component ships no event types. */
export interface FeaturedSlide {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  city: string;
  uf: string;
  venue: string;
  fromPriceCents: number | null;
  soldOut: boolean;
  /** A full `data:image/jpeg;base64,…`, or the real cover URL. */
  coverUrl?: string;
  blurDataUrl?: string;
  width?: number;
  height?: number;
}

/**
 * The featured row: one poster held large, its neighbours visible either side.
 *
 * What is FEATURED here is not an editorial flag somebody has to remember to
 * keep current — it is the soonest events that still have tickets, computed on
 * every render. A hand-curated hero is a hero that eventually promotes a show
 * that happened last month.
 *
 * It rotates, and the rotation is built to be survivable rather than clever:
 *
 *  - Every slide is a real link in the HTML, not a lazily mounted panel, so a
 *    crawler and a reader-mode both get all of them.
 *  - It STOPS on hover, on focus, and while the tab is hidden. A carousel that
 *    moves under a pointer is one that takes the click away from what was
 *    aimed at, and one that keeps cycling in a background tab is a timer
 *    burning battery for nobody.
 *  - `prefers-reduced-motion` disables the rotation entirely, not just the
 *    easing. Movement that starts on its own is the thing being asked about.
 *  - The controls are real buttons with labels, and the live region is off:
 *    a region that re-announces itself every six seconds is unusable with a
 *    screen reader.
 */
export function FeaturedCarousel({
  slides,
  locale,
}: {
  slides: FeaturedSlide[];
  locale: Locale;
}) {
  const t = useTranslations("catalogue");
  const [emblaRef, embla] = useEmblaCarousel({
    loop: slides.length > 2,
    align: "center",
    // The neighbours are meant to be seen, not scrolled past in a group.
    containScroll: false,
    skipSnaps: false,
  });
  const [selected, setSelected] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (!embla) return;
    const sync = () => setSelected(embla.selectedScrollSnap());
    sync();
    embla.on("select", sync);
    embla.on("reInit", sync);
    return () => {
      embla.off("select", sync);
      embla.off("reInit", sync);
    };
  }, [embla]);

  // The rotation. Every reason to stop is a dependency, so there is exactly one
  // place that decides whether a timer exists.
  React.useEffect(() => {
    if (!embla || paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      // Only while the tab is actually being looked at.
      if (document.hidden) return;
      embla.scrollNext();
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [embla, paused, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[selected] ?? slides[0];

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("featured")}
      className="flex flex-col gap-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative">
        {/* The viewport deliberately bleeds past the page gutter, so the
            neighbouring posters are cut by the window rather than by a
            container edge — which is what makes them read as "there is more"
            instead of as cropped cards. */}
        <div className="-mx-4 overflow-hidden sm:-mx-6 lg:-mx-8" ref={emblaRef}>
          {/* items-center so the scaled-down neighbours sit on the centre
              poster's midline rather than hanging from its top edge. */}
          <div className="flex touch-pan-y items-center py-4">
            {slides.map((slide, index) => (
              <Slide
                key={slide.id}
                slide={slide}
                active={index === selected}
                position={t("slidePosition", { index: index + 1, total: slides.length })}
              />
            ))}
          </div>
        </div>

        {slides.length > 1 ? (
          <>
            <Arrow side="prev" label={t("previous")} onClick={() => embla?.scrollPrev()} />
            <Arrow side="next" label={t("next")} onClick={() => embla?.scrollNext()} />
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <ul className="flex items-center justify-center gap-2" role="tablist" aria-label={t("featured")}>
          {slides.map((slide, index) => (
            <li key={slide.id}>
              <button
                type="button"
                role="tab"
                aria-selected={index === selected}
                aria-label={slide.name}
                onClick={() => embla?.scrollTo(index)}
                className={cn(
                  "block h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  index === selected ? "w-6 bg-primary" : "w-2 bg-border-strong hover:bg-control-edge",
                )}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* The details of whichever poster is centred. Below the row and centred,
          because the poster is the thing being looked at and a column of text
          beside it would compete with the artwork it is describing.
          aria-live is off on purpose: this changes every six seconds. */}
      <div className="text-center" aria-live="off">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <Link
            href={`/eventos/${current.slug}`}
            className="rounded-[--radius] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {current.name}
          </Link>
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} aria-hidden />
            {current.city}
            {current.uf ? ` - ${current.uf}` : ""}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarBlank size={15} aria-hidden />
            <time dateTime={current.startsAt}>{formatCardDateTime(current.startsAt, locale)}</time>
          </span>
          {current.soldOut ? (
            <span className="font-semibold text-muted-foreground">{t("soldOut")}</span>
          ) : current.fromPriceCents === 0 ? (
            <span className="font-semibold text-healthy-ink">{t("free")}</span>
          ) : current.fromPriceCents !== null ? (
            <span>{t("fromPrice", { price: formatMoney(current.fromPriceCents, locale) })}</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}

/**
 * One poster.
 *
 * The inactive slides are scaled down and dimmed rather than hidden, which is
 * what produces the "there are more behind this one" read. They stay real
 * links: a person who can see a poster expects clicking it to work, and making
 * them centre it first would be a rule only the implementation knows about.
 */
function Slide({
  slide,
  active,
  position,
}: {
  slide: FeaturedSlide;
  active: boolean;
  position: string;
}) {
  return (
    <div
      className={cn(
        // Wide enough that the centre poster is the thing you look at, with a
        // NEGATIVE margin so its neighbours tuck underneath its edges instead
        // of sitting in a row beside it. That overlap is what makes the row
        // read as a stack with more behind it.
        "relative min-w-0 shrink-0 grow-0 basis-[82%] -mx-5 sm:basis-[64%] sm:-mx-7 lg:basis-[52%] lg:-mx-10",
        // The centre poster is drawn over its neighbours; without an explicit
        // stacking order a flex row paints later children on top, so the slide
        // to the RIGHT would overlap the active one.
        active ? "z-20" : "z-0",
      )}
      role="group"
      aria-roledescription="slide"
      aria-label={position}
    >
      <Link
        href={`/eventos/${slide.slug}`}
        tabIndex={active ? 0 : -1}
        className={cn(
          "block overflow-hidden rounded-xl border border-border bg-muted transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
          active
            ? "scale-100 opacity-100 shadow-[var(--elev-6)]"
            : "scale-[0.82] opacity-70 shadow-[var(--elev-3)]",
        )}
      >
        <span className="block aspect-[1.91/1] w-full">
          {slide.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.coverUrl}
              alt={slide.name}
              width={slide.width}
              height={slide.height}
              className="h-full w-full object-cover"
              // The centred poster is the page's LCP element; the others are
              // one flick away and can wait.
              loading={active ? "eager" : "lazy"}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              {...({ fetchpriority: active ? "high" : "auto" } as any)}
            />
          ) : (
            <span className="block h-full w-full bg-muted" />
          )}
        </span>
      </Link>
    </div>
  );
}

function Arrow({
  side,
  label,
  onClick,
}: {
  side: "prev" | "next";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "prev" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-foreground shadow-[var(--elev-4)] transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        side === "prev" ? "left-1 sm:left-3" : "right-1 sm:right-3",
      )}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
