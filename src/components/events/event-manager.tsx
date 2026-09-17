"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { EventImage, coverImage } from "@/components/events/event-image";
import {
  ArrowSquareOut,
  CalendarBlank,
  ChartBar,
  CircleNotch,
  Eye,
  MapPin,
  PencilSimple,
  Plus,
  Prohibit,
  Receipt,
  SealCheck,
  Storefront,
} from "@/components/icons";
import { SalesChecklist } from "@/components/events/sales-checklist";
import { EventSeatingPanel } from "@/components/seating/event-seating-panel";
import { NewTierDialog } from "@/components/tickets/new-tier-dialog";
import { TicketStatusChip } from "@/components/tickets/ticket-status-chip";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/routing";
import { getOwnEvent, publishEvent, unpublishEvent } from "@/lib/events/admin-api";
import type { EventSummary } from "@/lib/events/types";
import { changeTicketStatus, listTickets } from "@/lib/tickets/api";
import { formatLongDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { Ticket, TicketStatus } from "@/lib/tickets/types";

/**
 * One event, and everything an organiser does to it.
 *
 * This screen exists because the two halves of running an event were in two
 * unrelated places: the event list could publish and rename a night, and a
 * separate global tier workspace held every tier of every event behind a
 * filter. Nobody manages a box office that way. An organiser thinks "Festival
 * X" and wants its door time, its tiers, what has sold and what is held, on
 * one page, with the actions next to the numbers they change.
 *
 * The numbers are the point. A tier reading "372 available" tells an operator
 * almost nothing on the night tickets are moving; sold, held and remaining are
 * three different facts with three different responses, and holds in particular
 * look like sales right up until they expire.
 */
export function EventManager({ eventId }: { eventId: string }) {
  const t = useTranslations("eventManager");
  const tAdmin = useTranslations("eventAdmin");
  const locale = useLocale() as Locale;

  const [event, setEvent] = React.useState<EventSummary | null>(null);
  const [tiers, setTiers] = React.useState<Ticket[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  // Whether this night has a seat map. Reported by the seating panel, which is
  // the only thing that asks, so the checklist can draw the whole chain without
  // a second request for the same answer.
  const [seatsBound, setSeatsBound] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Both at once: the tiers do not depend on the event, and stacking the
      // two latencies would leave the page blank for twice as long.
      const [found, page] = await Promise.all([
        getOwnEvent(eventId),
        listTickets({ eventId, limit: 100, sort: "price" }),
      ]);
      if (cancelled) return;
      // A failed tier read is NOT an event with no tiers. Falling through to
      // the empty state rendered "this event has no tiers yet" over a network
      // error, in confident copy, with a button to create the first one — so
      // both reads are judged before either result is committed.
      if (found.error || !found.data || page.error) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setEvent(found.data);
      setTiers(page.data?.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // Loaded once. Every mutation on this screen writes the row it changed
    // back into state from the server's own response, so there is nothing a
    // re-fetch would correct, and a page that silently re-read itself would
    // discard an optimistic row an operator is still looking at.
  }, [eventId]);

  async function togglePublished() {
    if (!event) return;
    setBusy("event");
    const result =
      event.status === "published" ? await unpublishEvent(event.id) : await publishEvent(event.id);
    setBusy(null);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? tAdmin("errors.save"));
      return;
    }
    setEvent(result.data);
    toast.success(result.data.status === "published" ? tAdmin("published") : tAdmin("unpublished"));
  }

  async function moveTier(tier: Ticket, status: TicketStatus) {
    setBusy(tier.id);
    const result = await changeTicketStatus(tier.id, status);
    setBusy(null);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("errors.tierStatus"));
      return;
    }
    const saved = result.data;
    setTiers((current) => current?.map((item) => (item.id === saved.id ? saved : item)) ?? null);
    toast.success(t("tierUpdated"));
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <div className="notice notice-fault px-6 py-16 text-center">
          <p className="notice-ink font-display text-lg font-semibold">{t("notFound")}</p>
          <Link
            href="/events"
            className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            {t("backToEvents")}
          </Link>
        </div>
      </div>
    );
  }

  if (!event || !tiers) return <ManagerSkeleton />;

  const totals = summarise(tiers);
  const cover = coverImage(event.media);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <DashboardPageHeader
        icon={<Storefront weight="regular" />}
        title={event.name}
        description={`${formatLongDateTime(event.startsAt, locale)} · ${event.location.venue}`}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant={event.status === "published" ? "outline" : "primary"}
              disabled={busy === "event" || event.status === "cancelled"}
              onClick={() => void togglePublished()}
            >
              {busy === "event" ? (
                <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : event.status === "published" ? (
                <Prohibit className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <SealCheck className="h-3.5 w-3.5" aria-hidden />
              )}
              {event.status === "published" ? tAdmin("unpublish") : tAdmin("publish")}
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/events/${event.id}/edit`}>
                <PencilSimple className="h-3.5 w-3.5" aria-hidden />
                {t("editEvent")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/tickets/new?event=${event.id}`}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("newTier")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/orders?event=${event.id}`}>
                <Receipt className="h-3.5 w-3.5" aria-hidden />
                {t("viewOrders")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/events/${event.id}/report`}>
                <ChartBar className="h-3.5 w-3.5" aria-hidden />
                {t("viewReport")}
              </Link>
            </Button>
            {event.status === "published" ? (
              <Button asChild size="sm" variant="outline">
                <a href={`/${locale}/eventos/${event.slug}`} target="_blank" rel="noopener noreferrer">
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  {t("viewPublic")}
                  <ArrowSquareOut className="h-3 w-3" aria-hidden />
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      {/* The four numbers that answer "how is this event doing", before any
          detail. Revenue is of PAID tickets only: counting held stock as money
          would report a number that evaporates when a hold lapses. */}
      <section aria-label={t("summaryLabel")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("stats.sold")} value={formatNumber(totals.sold, locale)} tone="healthy" />
        <Stat
          label={t("stats.held")}
          value={formatNumber(totals.reserved, locale)}
          hint={t("stats.heldHint")}
          tone="warning"
        />
        <Stat label={t("stats.available")} value={formatNumber(totals.available, locale)} />
        <Stat
          label={t("stats.revenue")}
          value={formatMoney(totals.revenueCents, locale, totals.currency)}
          hint={t("stats.revenueHint")}
        />
      </section>

      {/* What still has to happen before this night can sell, drawn once.
          Above the seating offer and the tiers, because it is what tells an
          organiser which of those two to go and touch. */}
      <SalesChecklist
        seated={(event.salesMode ?? "counted") === "seated"}
        hasTiers={tiers.length > 0}
        seatsBound={seatsBound}
        onSale={totals.onSale > 0}
        published={event.status === "published"}
      />

      {/* Reserved seating, offered rather than presented.
          It lives on this page and not in the event form because binding needs
          an event that EXISTS and tiers to point the blocks at, neither of
          which a create form has. Without it the studio was a drawing tool
          whose output could never be sold — and unfolded on every event page it
          was a wall of apparatus about a feature most events do not use, so it
          asks first and takes one line until it is wanted. */}
      <div className="border-t border-border pt-5">
        <EventSeatingPanel
          eventId={event.id}
          tiers={tiers}
          salesMode={event.salesMode ?? "counted"}
          onBound={setSeatsBound}
          eventName={event.name}
          venueName={event.location.venue}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="tiers-heading" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="tiers-heading" className="font-display text-lg font-semibold text-foreground">
              {t("tiersTitle")}
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {t("tierCount", { count: tiers.length })}
              </p>
              <NewTierDialog
                eventId={event.id}
                onCreated={(tier) => setTiers((current) => [...(current ?? []), tier])}
              />
            </div>
          </div>

          {tiers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-14 text-center">
              <p className="font-display text-base font-semibold text-card-foreground">
                {t("noTiersTitle")}
              </p>
              <p className="mx-auto mt-2 max-w-[48ch] text-sm text-muted-foreground">
                {t("noTiersBody")}
              </p>
              <div className="mt-5 flex justify-center">
                <NewTierDialog
                  eventId={event.id}
                  variant="primary"
                  onCreated={(tier) => setTiers((current) => [...(current ?? []), tier])}
                />
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {tiers.map((tier) => (
                <TierRow
                  key={tier.id}
                  tier={tier}
                  locale={locale}
                  busy={busy === tier.id}
                  onMove={moveTier}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {cover ? (
              <EventImage
                media={cover}
                alt={event.name}
                sizes="320px"
                className="h-36 w-full object-cover"
                fallbackRatio={1.91}
              />
            ) : null}
            <dl className="flex flex-col gap-3 p-4 text-sm">
              <Fact icon={CalendarBlank} label={t("when")}>
                <time dateTime={event.startsAt}>{formatLongDateTime(event.startsAt, locale)}</time>
              </Fact>
              <Fact icon={MapPin} label={t("where")}>
                <span className="block font-medium text-foreground">{event.location.venue}</span>
                {event.location.city}
                {event.location.uf ? ` - ${event.location.uf}` : ""}
              </Fact>
            </dl>
          </div>

          {/* The one thing an organiser most often gets wrong, said where they
              are about to get it wrong: a published event with no tier on sale
              is a page a buyer can reach and cannot buy from. The checklist
              above says what is still missing; this says what is already wrong.
              */}
          {event.status === "published" && totals.onSale === 0 ? (
            <p className="notice notice-warning notice-ink px-4 py-3 text-sm">
              {t("publishedWithNothingOnSale")}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TierRow({
  tier,
  locale,
  busy,
  onMove,
}: {
  tier: Ticket;
  locale: Locale;
  busy: boolean;
  onMove: (tier: Ticket, status: TicketStatus) => void;
}) {
  const t = useTranslations("eventManager");
  const sellable = tier.status === "draft" || tier.status === "sold_out";
  const soldThrough = tier.quantity === 0 ? 0 : Math.round((tier.sold / tier.quantity) * 100);

  return (
    <li className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-card-foreground">{tier.title}</h3>
            <TicketStatusChip status={tier.status} />
          </div>
          {tier.description ? (
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{tier.description}</p>
          ) : null}
        </div>
        <p className="shrink-0 font-display text-base font-semibold tabular-nums text-card-foreground">
          {tier.priceCents === 0 ? t("free") : formatMoney(tier.priceCents, locale, tier.currency)}
        </p>
      </div>

      {/* Sold, held and remaining as one bar, because they are one capacity.
          Three separate numbers make an operator do the arithmetic that this
          shows at a glance, and holds sitting next to sales is exactly the
          comparison that matters while a tier is selling. */}
      <div className="mt-3">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <span
            className="bg-healthy"
            style={{ width: `${percent(tier.sold, tier.quantity)}%` }}
          />
          <span
            className="bg-warning"
            style={{ width: `${percent(tier.reserved, tier.quantity)}%` }}
          />
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <Counted label={t("stats.sold")} value={tier.sold} className="text-healthy-ink" />
          <Counted label={t("stats.held")} value={tier.reserved} className="text-warning-ink" />
          <Counted label={t("stats.available")} value={tier.available} className="text-muted-foreground" />
          <Counted label={t("capacity")} value={tier.quantity} className="text-muted-foreground" />
          <span className="text-muted-foreground tabular-nums">{t("soldThrough", { percent: soldThrough })}</span>
        </dl>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/tickets/${tier.id}/edit`}>
            <PencilSimple className="h-3.5 w-3.5" aria-hidden />
            {t("editTier")}
          </Link>
        </Button>

        {sellable ? (
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={busy || tier.available === 0}
            onClick={() => onMove(tier, "on_sale")}
          >
            {busy ? <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {t("putOnSale")}
          </Button>
        ) : null}

        {tier.status === "on_sale" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onMove(tier, "draft")}
          >
            {busy ? <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {t("pauseSales")}
          </Button>
        ) : null}

        {tier.status !== "cancelled" ? (
          <ConfirmDialog
            title={t("cancelTierTitle", { tier: tier.title })}
            description={
              tier.sold > 0 ? t("cancelTierSold", { count: tier.sold }) : t("cancelTierBody")
            }
            confirmLabel={t("cancelTierConfirm")}
            onConfirm={() => onMove(tier, "cancelled")}
            trigger={
              <Button type="button" size="sm" variant="outline" disabled={busy}>
                <Prohibit className="h-3.5 w-3.5" aria-hidden />
                {t("cancelTier")}
              </Button>
            }
          />
        ) : null}
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "healthy" | "warning";
}) {
  const ink =
    tone === "healthy" ? "text-healthy-ink" : tone === "warning" ? "text-warning-ink" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${ink}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Counted({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <span className={className}>
      <span className="font-semibold tabular-nums">{value}</span>{" "}
      <span className="text-muted-foreground">{label.toLowerCase()}</span>
    </span>
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
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
      <Icon size={16} aria-hidden className="mt-0.5 text-muted-foreground" />
      <div>
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm text-muted-foreground">{children}</dd>
      </div>
    </div>
  );
}

function ManagerSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6" aria-hidden>
      <div className="h-20 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    </div>
  );
}

/** A percentage of capacity, clamped so a bad row cannot overflow the bar. */
function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * The event's totals.
 *
 * Revenue counts SOLD tickets only. Held stock is not money: a hold expires and
 * the ticket goes back on sale, so reporting it as revenue would show an
 * organiser a number that shrinks on its own overnight.
 */
function summarise(tiers: Ticket[]) {
  return tiers.reduce(
    (totals, tier) => ({
      sold: totals.sold + tier.sold,
      reserved: totals.reserved + tier.reserved,
      available: totals.available + tier.available,
      capacity: totals.capacity + tier.quantity,
      onSale: totals.onSale + (tier.status === "on_sale" ? 1 : 0),
      revenueCents: totals.revenueCents + tier.sold * tier.priceCents,
      currency: tier.currency || totals.currency,
    }),
    {
      sold: 0,
      reserved: 0,
      available: 0,
      capacity: 0,
      onSale: 0,
      revenueCents: 0,
      currency: "BRL",
    },
  );
}
