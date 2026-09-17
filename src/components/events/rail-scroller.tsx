"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { CaretLeft, CaretRight, CircleNotch } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import type { EventListing, EventQuery } from "@/lib/events/types";
import { cn } from "@/lib/utils";

import { EventCard } from "./event-card";
import { moreRailEvents } from "./rail-actions";

/** The card track's width at each breakpoint, matched by the server's markup. */
const CARD = "w-[264px] shrink-0 snap-start sm:w-[300px]";

/**
 * The scrolling half of a rail: arrows, snapping, and the rest of the row.
 *
 * A SCROLLER, not a carousel. No autoplay, no timed rotation, no hidden state:
 * the cards are real links in a list that overflows, and the arrows only do
 * what a trackpad already does. A row that moves on its own hides most of its
 * content from anyone not watching it, and all of it from a crawler.
 *
 * The first screenful arrives as server-rendered children, so the row is in the
 * HTML and is readable before any JavaScript runs. Everything past it is asked
 * for when somebody actually scrolls that far — see moreRailEvents. Those later
 * cards are the SAME EventCard the server used, which is why that component is
 * synchronous.
 */
export function RailScroller({
  children,
  query,
  locale,
  loaded,
  total,
  pageSize,
}: {
  /** The server-rendered first page, already cards. */
  children: React.ReactNode;
  query: Pick<EventQuery, "sort" | "from" | "until" | "free" | "available" | "category">;
  locale: Locale;
  /** How many the server already sent, which is where the next page starts. */
  loaded: number;
  total: number;
  pageSize: number;
}) {
  const t = useTranslations("catalogue");
  const track = React.useRef<HTMLUListElement | null>(null);
  const [extra, setExtra] = React.useState<EventListing[]>([]);
  const [more, setMore] = React.useState(loaded < total);
  const [busy, setBusy] = React.useState(false);
  const [edges, setEdges] = React.useState({ start: true, end: false });
  // Guards the fetch against a flick that fires the scroll handler repeatedly
  // before the first response lands; state is a render behind and would let
  // three requests for the same page through.
  const fetching = React.useRef(false);

  const measure = React.useCallback(() => {
    const node = track.current;
    if (!node) return;
    const remaining = node.scrollWidth - node.clientWidth - node.scrollLeft;
    setEdges({ start: node.scrollLeft <= 1, end: remaining <= 1 });
    return remaining;
  }, []);

  const fetchMore = React.useCallback(async () => {
    if (fetching.current || !more) return;
    fetching.current = true;
    setBusy(true);
    try {
      const page = await moreRailEvents(query, loaded + extra.length, pageSize);
      setExtra((current) => [...current, ...page.events]);
      setMore(page.more && page.events.length > 0);
    } catch {
      // A rail that cannot extend is a rail that stops, not a page that breaks.
      // What is already on screen stays, and the arrow stops asking.
      setMore(false);
    } finally {
      fetching.current = false;
      setBusy(false);
    }
  }, [extra.length, loaded, more, pageSize, query]);

  const onScroll = React.useCallback(() => {
    const remaining = measure();
    // One card's width of runway, so the next page is on its way before the
    // reader arrives at the gap rather than after they have stared at it.
    if (remaining !== undefined && remaining < 320) void fetchMore();
  }, [fetchMore, measure]);

  React.useEffect(() => {
    measure();
    const node = track.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const resizer = new ResizeObserver(() => measure());
    resizer.observe(node);
    return () => resizer.disconnect();
  }, [measure]);

  const nudge = (direction: 1 | -1) => {
    const node = track.current;
    if (!node) return;
    // A screenful less one card, so the card at the edge stays visible and the
    // reader keeps their place instead of being teleported past it.
    const step = Math.max(node.clientWidth - 320, 280);
    node.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <ul
        ref={track}
        onScroll={onScroll}
        // scroll-padding matches the row's own padding. Without it a
        // snap-start row with padding settles at scrollLeft = padding on
        // load, which cut the left edge off the first card and lit the
        // "previous" arrow on a row nobody had scrolled yet.
        className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:scroll-pl-6 sm:px-6 lg:-mx-8 lg:scroll-pl-8 lg:px-8"
      >
        {children}
        {extra.map((event) => (
          <li key={event.id} className={CARD}>
            <EventCard event={event} locale={locale} />
          </li>
        ))}
        {busy ? (
          <li className={cn(CARD, "flex items-center justify-center")} aria-hidden="true">
            <CircleNotch className="size-5 animate-spin text-muted-foreground" />
          </li>
        ) : null}
      </ul>

      {/* Over the poster row, vertically centred on it rather than on the whole
          card, so the arrow never sits beside the words. Hidden from assistive
          technology and from keyboards: the list is already a list of links and
          tabbing through it scrolls it, so these would be two extra stops that
          do nothing a reader cannot already do. */}
      <Arrow side="left" hidden={edges.start} onClick={() => nudge(-1)} label={t("rail.previous")} />
      <Arrow
        side="right"
        hidden={edges.end && !more}
        onClick={() => nudge(1)}
        label={t("rail.next")}
      />
    </div>
  );
}

function Arrow({
  side,
  hidden,
  onClick,
  label,
}: {
  side: "left" | "right";
  hidden: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      title={label}
      className={cn(
        "absolute top-[28%] hidden size-9 -translate-y-1/2 place-items-center rounded-full",
        "border border-border bg-card text-foreground shadow-[var(--elev-3)]",
        "transition-opacity hover:bg-muted md:grid",
        side === "left" ? "-left-3" : "-right-3",
        hidden ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
