"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { CalendarBlank, MapPin, Receipt } from "@/components/icons";
import { OrderStatusChip } from "@/components/orders/order-status-chip";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/routing";
import { RefundAction } from "@/components/orders/refund-action";
import { TicketWallet } from "@/components/admissions/ticket-wallet";
import { cancelOrder, listOrders, type Order } from "@/lib/checkout/api";
import { formatLongDateTime, formatMoney } from "@/lib/format";

const PAGE_SIZE = 20;

/** The status tabs, in the order a buyer thinks about them. */
/**
 * The views this page offers, and what each one asks the server for.
 *
 * "active" leads and is the default. An abandoned checkout is persisted as an
 * `expired` order, so a list of everything is mostly carts nobody finished --
 * one real ticket behind six dead holds, which is what this page looked like.
 * The dead ones are still reachable under "all", because a buyer who wants to
 * know what happened to an order deserves an answer.
 *
 * Note what "active" is NOT: paid alone. An order awaiting payment is the one
 * with a deadline, and the single most common reason somebody opens this page
 * is the PIX code they closed by accident. Defaulting to paid would hide
 * exactly that, so the default is everything still alive -- paid, awaiting
 * payment, and owed a refund.
 */
const VIEWS = {
  active: ["paid", "pending_payment", "refund_required"],
  pending_payment: ["pending_payment"],
  paid: ["paid"],
  refund_required: ["refund_required"],
  all: [],
} as const;

const FILTERS = Object.keys(VIEWS) as Filter[];
type Filter = keyof typeof VIEWS;

/**
 * What the buyer has bought, and what is still waiting on them.
 *
 * Ordered newest first and led by whatever needs doing: an order awaiting
 * payment keeps its "pay now" route until the hold lapses, because the single
 * most common thing a person comes to this page for is the PIX code they closed
 * by accident.
 *
 * A client component, unlike the catalogue next door. This page is private, it
 * is behind a session, and it has actions that change what it is showing, none
 * of which a cached server render is any good at.
 */
export function OrderList() {
  const t = useTranslations("orders");
  const params = useSearchParams();
  // Scoped to one night when arriving from that event's own page. Read once:
  // it is where the visitor came FROM, not something this screen changes.
  const [eventId] = useState(() => params.get("event")?.trim() ?? "");
  const [filter, setFilter] = useState<Filter>("active");
  const [offset, setOffset] = useState(0);

  return (
    <div className="mx-auto max-w-[1600px]">
      <DashboardPageHeader
        icon={<Receipt weight="regular" />}
        title={t("title")}
        description={t("description")}
        actions={
          <div role="tablist" aria-label={t("filterLabel")} className="flex gap-1">
            {FILTERS.map((option) => (
              <button
                key={option}
                role="tab"
                type="button"
                aria-selected={filter === option}
                onClick={() => {
                  setFilter(option);
                  // A filter change is a new result set, so page one of it.
                  // Keeping the offset would land on an empty page the buyer
                  // then has to page backwards out of.
                  setOffset(0);
                }}
                className={`h-8 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors ${
                  filter === option
                    ? "bg-primary text-primary-foreground"
                    : "border border-border-strong bg-card text-foreground hover:bg-accent-hover"
                }`}
              >
                {t(`filters.${option}`)}
              </button>
            ))}
          </div>
        }
      />

      {/* Keyed on the query, so changing the filter or the page REMOUNTS this
          with a fresh "not loaded yet" state.
          The alternative, one long-lived component that resets its own state
          from an effect when the query changes: sets state during an effect,
          which renders once with the old page's rows under the new page's
          heading before correcting itself. Letting React discard the old
          instance says the same thing without the wrong frame in between. */}
      <OrdersPage
        key={`${filter}:${offset}:${eventId}`}
        filter={filter}
        offset={offset}
        eventId={eventId}
        onPage={setOffset}
      />
    </div>
  );
}

function OrdersPage({
  filter,
  offset,
  eventId,
  onPage,
}: {
  filter: Filter;
  offset: number;
  eventId: string;
  onPage: (offset: number) => void;
}) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;

  // null is "not loaded yet". A separate boolean would have to be reset in step
  // with the data, and the two drift the moment a request fails.
  const [page, setPage] = useState<{ orders: Order[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumped after a row changes something, to ask for the page again.
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((current) => current + 1), []);

  // The request lives inside the effect rather than in a callback the effect
  // calls. It is the same work either way, but written here the first statement
  // is an await, so nothing sets state before React has painted, which is what
  // stops a fetch on mount from costing an extra render pass.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: failed } = await listOrders({
        status: VIEWS[filter],
        eventId: eventId || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      if (cancelled) return;
      if (failed || !data) {
        setError(failed?.message ?? t("loadFailed"));
        return;
      }
      setError(null);
      setPage({ orders: data.data, total: data.total });
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, offset, eventId, reload, t]);

  const orders = page?.orders ?? [];
  const total = page?.total ?? 0;
  const lastPage = offset + PAGE_SIZE >= total;

  return (
    <div className="mt-5">
      {error ? (
        <p
          role="alert"
          className="notice notice-fault notice-ink px-4 py-3 text-sm"
        >
          {error}
        </p>
      ) : page === null ? (
        <OrderSkeletons />
      ) : orders.length === 0 ? (
        // "Filtered" only for the narrow views. An empty "active" list is
        // the ordinary case of somebody who has not bought anything yet, and
        // telling them nothing matches their filter -- a filter they never
        // chose, being the default -- would be both wrong and a dead end,
        // where the plain empty state carries the route to the catalogue.
        <Empty filtered={filter !== "active" && filter !== "all"} />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderRow order={order} locale={locale} onChanged={refresh} />
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE ? (
        <nav className="mt-5 flex items-center justify-between gap-3" aria-label={t("pagination")}>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {t("showing", {
              first: total === 0 ? 0 : offset + 1,
              last: Math.min(offset + orders.length, total),
              total,
            })}
          </p>
          <div className="flex gap-2">
            <PageButton disabled={offset === 0} onClick={() => onPage(Math.max(offset - PAGE_SIZE, 0))}>
              {t("previous")}
            </PageButton>
            <PageButton disabled={lastPage} onClick={() => onPage(offset + PAGE_SIZE)}>
              {t("next")}
            </PageButton>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-md border border-border-strong bg-card px-3 text-sm font-medium text-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function OrderRow({
  order,
  locale,
  onChanged,
}: {
  order: Order;
  locale: Locale;
  onChanged: () => void;
}) {
  const t = useTranslations("orders");
  const [cancelling, setCancelling] = useState(false);
  const lapsed = useHoldLapsed(order.holdExpiresAt);

  // "Pay now" is offered only while there is something left to pay against. A
  // button that leads to an expired hold is worse than no button.
  const payable = order.status === "pending_payment" && !lapsed;

  const cancel = async () => {
    setCancelling(true);
    await cancelOrder(order.id);
    setCancelling(false);
    onChanged();
  };

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-card-foreground">
            {order.event?.name ?? t("unknownEvent")}
          </h3>
          <p className="mt-0.5 select-all font-mono text-xs text-muted-foreground">{order.id}</p>
        </div>
        <OrderStatusChip status={order.status} className="mt-1" />
      </div>

      {/* The ticket leads, on a paid order.
          This page is opened in a queue far more often than at a desk, so the
          QR goes first and the receipt -- dates, lines, totals, actions --
          follows it. Nothing is issued before the money arrives, hence the
          guard: on an unpaid order this would render an empty state exactly
          where a buyer is looking for a QR, and the thing that leads there is
          the pay button below, which is the one with a deadline. */}
      {order.status === "paid" ? (
        <div className="border-b border-border px-4 py-4">
          <TicketWallet orderId={order.id} />
        </div>
      ) : null}

      <div className="grid gap-4 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 text-sm text-muted-foreground">
          {order.event ? (
            <>
              <p className="flex items-center gap-2">
                <CalendarBlank size={15} aria-hidden className="shrink-0" />
                <time dateTime={order.event.startsAt}>
                  {formatLongDateTime(order.event.startsAt, locale)}
                </time>
              </p>
              <p className="mt-1 flex items-center gap-2">
                <MapPin size={15} aria-hidden className="shrink-0" />
                <span className="truncate">
                  {order.event.venue} · {order.event.city}
                  {order.event.uf ? ` - ${order.event.uf}` : ""}
                </span>
              </p>
            </>
          ) : null}

          {/* Every line, named. An order that collapsed into "3 ingressos"
              would hide exactly the thing the basket was built to allow. */}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {order.items.map((item) => (
              <li key={item.ticketId} className="text-sm text-foreground">
                <span className="font-semibold tabular-nums">{item.quantity}×</span>{" "}
                {item.ticketTitle || t("unknownTier")}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="text-right">
            <p className="font-display text-lg font-semibold tabular-nums text-card-foreground">
              {formatMoney(order.totalCents, locale, order.currency)}
            </p>
            {/* The split, once there is one. A buyer looking at a past order and
                comparing it with the ticket price needs to find the difference
                named rather than have to work it out. */}
            {order.serviceFeeCents > 0 ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatMoney(order.subtotalCents, locale, order.currency)}
                {" + "}
                {formatMoney(order.serviceFeeCents, locale, order.currency)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {payable ? (
              <Link
                href={`/checkout?order=${order.id}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                {t("payNow")}
              </Link>
            ) : null}
            {order.status === "pending_payment" ? (
              <button
                type="button"
                onClick={cancel}
                disabled={cancelling}
                className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {cancelling ? t("cancelling") : t("cancel")}
              </button>
            ) : null}
            {order.event ? (
              <Link
                href={`/eventos/${order.event.slug}`}
                className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover"
              >
                {t("viewEvent")}
              </Link>
            ) : null}
            {/* Renders nothing unless the order was actually paid: an unpaid
                hold is cancelled, which is the button above, not refunded. */}
            <RefundAction order={order} onChanged={onChanged} />
          </div>
        </div>
      </div>

      {order.status === "refund_required" ? (
        // Said plainly and in the buyer's favour. This state means their money
        // arrived after the tickets had gone back on sale; they are owed a
        // refund and should not have to work out why from a status word.
        <p className="notice notice-warning notice-ink rounded-none border-x-0 border-b-0 px-4 py-2 text-xs">
          {t("refundRequiredNote")}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Whether a hold's deadline has passed, without reading the clock during render.
 *
 * Reading Date.now() while rendering makes the same props produce different
 * output on two renders, which is what React's purity rule is about: a row
 * could show "pay now" and then not, with nothing having changed. The clock is
 * read on a timer instead, so the value only ever changes between renders.
 */
function useHoldLapsed(expiresAt: string): boolean {
  const [lapsed, setLapsed] = useState(false);

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    const timer = window.setInterval(() => {
      setLapsed(Date.now() >= target);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return lapsed;
}

function OrderSkeletons() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <li key={index} className="h-[148px] animate-pulse rounded-lg border border-border bg-card" />
      ))}
    </ul>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  const t = useTranslations("orders");
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold text-card-foreground">
        {filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
      </p>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm text-muted-foreground">
        {filtered ? t("emptyFilteredBody") : t("emptyBody")}
      </p>
      {filtered ? null : (
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {t("browseEvents")}
        </Link>
      )}
    </div>
  );
}
