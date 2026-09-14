"use client";

import * as React from "react";

import { ArrowLeft, CalendarBlank, CurrencyDollar, MapPin, PencilSimple, Prohibit, SealCheck, Trash } from "@/components/icons";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { EventDirectory } from "@/lib/events/directory";
import type { Ticket, TicketStatus } from "@/lib/tickets/types";
import { TicketMediaGallery } from "@/components/tickets/ticket-media-gallery";
import { TicketStatusChip } from "@/components/tickets/ticket-status-chip";
import { cn } from "@/lib/utils";

interface TicketDetailProps {
  /** Resolves the tier's eventId into the event it sells admission to. */
  events: EventDirectory;
  ticket: Ticket;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TicketStatus) => void | Promise<void>;
  onMediaChanged: () => void | Promise<void>;
  onBack: () => void;
  statusPending: boolean;
}

/**
 * The record an operator works against: what it is, what it costs, how much of
 * it is left, and the artwork that sells it.
 *
 * Actions sit at the top because that is where the eye already is after
 * choosing a row, and the one that changes what buyers can see, putting a
 * ticket on sale; is the only filled button on the panel.
 */
export function TicketDetail({
  events,
  ticket,
  onEdit,
  onDelete,
  onStatusChange,
  onMediaChanged,
  onBack,
  statusPending,
}: TicketDetailProps) {
  const t = useTranslations("tickets");
  const locale = useLocale() as Locale;

  const soldRatio = ticket.quantity > 0 ? ticket.sold / ticket.quantity : 0;

  return (
    <article className="flex min-h-0 flex-col">
      <header className="border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 -ml-1 inline-flex items-center gap-1 rounded-[--radius] px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <ArrowLeft size={14} />
          {t("actions.backToList")}
        </button>

        <p className="truncate text-xs text-muted-foreground">
          {events.nameOf(ticket.eventId, t("noEvent"))}
        </p>
        <div className="mt-0.5 flex items-start justify-between gap-3">
          <h2 className="min-w-0 font-display text-lg font-semibold leading-tight tracking-[0.01em]">
            {ticket.title}
          </h2>
          <TicketStatusChip status={ticket.status} className="mt-0.5 shrink-0" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusAction ticket={ticket} onStatusChange={onStatusChange} pending={statusPending} />
          <Button size="sm" variant="outline" onClick={onEdit}>
            <PencilSimple size={15} />
            {t("actions.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive-ink"
          >
            <Trash size={15} />
            {t("actions.delete")}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-4 py-3.5">
          {/* The date and the place belong to the event, so they are read from
              the directory rather than from the tier, which no longer carries
              them. */}
          <Fact icon={CalendarBlank} label={t("fields.startsAt")}>
            {formatDateTime(events.byId.get(ticket.eventId)?.startsAt, locale)}
          </Fact>
          <Fact icon={MapPin} label={t("fields.venue")}>
            <span className="block truncate">
              {events.byId.get(ticket.eventId)?.location.venue ?? t("noEvent")}
            </span>
            {events.byId.get(ticket.eventId)?.location.city ? (
              <span className="block truncate text-xs text-muted-foreground">
                {events.byId.get(ticket.eventId)?.location.city}
              </span>
            ) : null}
          </Fact>
          <Fact icon={CurrencyDollar} label={t("fields.price")}>
            <span className="tabular-nums">{formatMoney(ticket.priceCents, locale, ticket.currency)}</span>
          </Fact>
          <Fact icon={SealCheck} label={t("detail.revenue")}>
            <span className="tabular-nums">
              {formatMoney(ticket.available * ticket.priceCents, locale, ticket.currency)}
            </span>
          </Fact>
        </dl>

        {ticket.description && (
          <p className="border-b border-border px-4 py-3.5 text-sm leading-relaxed text-muted-foreground">
            {ticket.description}
          </p>
        )}

        <section className="border-b border-border px-4 py-3.5" aria-label={t("detail.stock")}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <h3 className="legend">{t("detail.stock")}</h3>
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("detail.stockValue", {
                sold: formatNumber(ticket.sold, locale),
                total: formatNumber(ticket.quantity, locale),
              })}
            </p>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={ticket.sold}
            aria-valuemin={0}
            aria-valuemax={ticket.quantity}
            aria-label={t("detail.stock")}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                ticket.available === 0 ? "bg-warning" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, Math.round(soldRatio * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("detail.remaining", { count: ticket.available })}
          </p>
        </section>

        <div className="px-4 py-3.5">
          <TicketMediaGallery ticketId={ticket.id} media={ticket.media} onChanged={onMediaChanged} />
        </div>
      </div>
    </article>
  );
}

/**
 * The single status action that makes sense right now, rather than a menu of
 * four transitions the operator has to read through. A draft gets published; a
 * live ticket can be pulled back; a sold-out or cancelled one is a state the
 * sale reached, and reopening it is an edit, not a button.
 */
function StatusAction({
  ticket,
  onStatusChange,
  pending,
}: {
  ticket: Ticket;
  onStatusChange: (status: TicketStatus) => void | Promise<void>;
  pending: boolean;
}) {
  const t = useTranslations("tickets.actions");

  if (ticket.status === "draft") {
    return (
      <Button size="sm" onClick={() => void onStatusChange("on_sale")} disabled={pending || ticket.available === 0}>
        <SealCheck size={15} />
        {t("publish")}
      </Button>
    );
  }

  if (ticket.status === "on_sale") {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => void onStatusChange("draft")} disabled={pending}>
          {t("backToDraft")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void onStatusChange("cancelled")}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive-ink"
        >
          <Prohibit size={15} />
          {t("cancelSale")}
        </Button>
      </>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => void onStatusChange("draft")} disabled={pending}>
      {t("backToDraft")}
    </Button>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 min-w-0 text-sm font-medium">{children}</dd>
      </div>
    </div>
  );
}
