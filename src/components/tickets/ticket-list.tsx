"use client";

import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useLocale, useTranslations } from "next-intl";

import { Image as ImageIcon } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import type { EventDirectory } from "@/lib/events/directory";
import type { EventListing } from "@/lib/events/types";
import type { Ticket } from "@/lib/tickets/types";
import { TicketStatusChip } from "@/components/tickets/ticket-status-chip";
import { cn } from "@/lib/utils";

interface TicketListProps {
  /** Resolves each tier's eventId into the event a person recognises. */
  events: EventDirectory;
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (ticket: Ticket) => void;
}

/**
 * The catalogue.
 *
 * Rows, not cards: an operator scans this looking for one event among many, and
 * a grid of equal tiles turns that scan into a search. Each row carries the
 * four things the scan is actually for — what it is, when the doors open, what
 * it costs, and how much of it is left.
 */
export function TicketList({ tickets, events, selectedId, onSelect }: TicketListProps) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;

  return (
    <ul className="divide-y divide-border">
      {tickets.map((ticket) => {
        const selected = ticket.id === selectedId;
        const cover = ticket.media.find((item) => item.kind === "image");
        const soldRatio = ticket.quantity > 0 ? ticket.sold / ticket.quantity : 0;

        return (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => onSelect(ticket)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-3 border-l px-3 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected
                  ? "border-l-primary bg-muted"
                  : "border-l-transparent hover:bg-accent-hover",
              )}
            >
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[--radius] border border-border bg-muted text-muted-foreground">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <ImageIcon size={16} aria-hidden="true" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-muted-foreground">{events.nameOf(ticket.eventId, t("noEvent"))}</span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-sm font-medium",
                        selected ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {ticket.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <TicketStatusChip status={ticket.status} />
                    <span className="mt-0.5 block whitespace-nowrap text-sm font-semibold tabular-nums">
                      {formatMoney(ticket.priceCents, locale, ticket.currency)}
                    </span>
                  </span>
                </span>

                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {eventLine(events.byId.get(ticket.eventId), locale, t("noEvent"))}
                </span>

                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        ticket.available === 0 ? "bg-warning" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, Math.round(soldRatio * 100))}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {t("list.stock", {
                      sold: formatNumber(ticket.sold, locale),
                      total: formatNumber(ticket.quantity, locale),
                    })}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The list while the first page is in flight. Rows, not a spinner: the shape
 *  of what is coming is itself information, and it stops the panel jumping. */
export function TicketListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <li key={row} className="flex items-start gap-3 px-3 py-3">
          <span className="size-11 shrink-0 animate-pulse rounded-[--radius] bg-muted" />
          <span className="min-w-0 flex-1 space-y-2 py-0.5">
            <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
            <span className="block h-3.5 w-40 animate-pulse rounded bg-muted" />
            <span className="block h-1 w-full animate-pulse rounded-full bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The line under a tier: when and where its event is.
 *
 * The facts belong to the event, not the tier, so they are read from the
 * directory. A tier whose event is not in the directory still renders a row —
 * the operator can see the tier and open it — rather than blanking the list.
 */
function eventLine(event: EventListing | undefined, locale: Locale, fallback: string): string {
  if (!event) return fallback;
  const place = [event.location.venue, event.location.city].filter(Boolean).join(" · ");
  return [formatDateTime(event.startsAt, locale), place].filter(Boolean).join(" · ");
}
