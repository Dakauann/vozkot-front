"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthDialog } from "@/contexts/auth-dialog-context";
import { intentParams, MAX_QUANTITY, totalQuantity } from "@/lib/checkout/intent";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { TicketTier } from "@/lib/events/types";
import { SeatPicker, SeatSelection } from "@/components/seating/seat-picker";
import { TierQuantityList } from "@/components/events/tier-quantity-list";
import { mixedCartLines, mixedCartReducer } from "@/components/events/mixed-cart";
import { Button } from "@/components/ui/button";
import type { Seat, Marker } from "@/lib/seating/api";

/** One basket for numbered chairs and admission without an assigned seat. */
export function SeatedBuyPanel({ eventId, tiers, eventSlug, locale, holdMinutes }: {
  eventId: string;
  tiers: TicketTier[];
  eventSlug: string;
  locale: Locale;
  holdMinutes: number;
}) {
  const t = useTranslations("seating");
  const event = useTranslations("event");
  const router = useRouter();
  const { requireAuth } = useAuthDialog();
  const [cart, dispatch] = React.useReducer(mixedCartReducer, { seats: [], quantities: {} });
  const [seatedTierIds, setSeatedTierIds] = React.useState<Set<string> | null>(null);
  const [areas, setAreas] = React.useState<Marker[]>([]);
  const [going, setGoing] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const submitting = React.useRef(false);

  // Fail closed until the complete map arrives. A sold-out seated tier still
  // has seats and must never turn into a quantity-only ticket.
  const onInventory = React.useCallback((seats: Seat[], markers: Marker[]) => {
    setAreas(markers);
    setSeatedTierIds(new Set(seats.map((seat) => seat.ticketId)));
  }, []);
  const countedTiers = seatedTierIds
    ? tiers.filter((tier) => !seatedTierIds.has(tier.id)).map((tier) => ({ ...tier, title: areas.find((area) => area.ticketId === tier.id)?.name ?? tier.title }))
    : [];
  const sectors = React.useMemo(() => tiers.map((tier) => ({
    ticketId: tier.id, title: tier.title, priceCents: tier.priceCents, feeCents: tier.feeCents,
  })), [tiers]);
  const lines = mixedCartLines(cart);
  const count = totalQuantity(lines);
  const counted = Object.values(cart.quantities).reduce((sum, quantity) => sum + quantity, 0);
  const currency = tiers[0]?.currency ?? "BRL";
  const face = lines.reduce((sum, line) =>
    sum + (tiers.find((tier) => tier.id === line.ticketId)?.priceCents ?? 0) * line.quantity, 0);
  const fees = lines.reduce((sum, line) =>
    sum + (tiers.find((tier) => tier.id === line.ticketId)?.feeCents ?? 0) * line.quantity, 0);

  const proceed = async () => {
    if (count === 0 || submitting.current) return;
    submitting.current = true;
    setGoing(true);
    setFailed(false);
    try {
      if (!(await requireAuth("checkout"))) return;
      router.push(`/checkout?${intentParams({ lines, eventSlug }).toString()}`);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setGoing(false);
    }
  };

  if (tiers.length === 0) return null;

  return (
    <div className="seat-picker-container space-y-4">
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div aria-live="polite" aria-atomic="true">
          <p className="text-xs text-muted-foreground">{t("ticketCount", { count })}</p>
          <p className="font-display text-lg font-semibold tabular-nums text-foreground">
            {t("total.total")}: {formatMoney(face + fees, locale, currency)}
          </p>
          {fees > 0 ? <p className="text-xs text-muted-foreground">{t("total.fee")}: {formatMoney(fees, locale, currency)}</p> : null}
        </div>
        <Button type="button" size="lg" disabled={going || count === 0} onClick={() => void proceed()} className="h-12 grow sm:grow-0" aria-busy={going}>
          {count === 0 ? event("pickATier") : event("buy", { count })}
        </Button>
      </div>
      {failed ? <p role="alert" className="notice notice-fault notice-ink p-3 text-sm">{t("checkoutFailed")}</p> : null}
      <SeatPicker
        eventId={eventId}
        sectors={sectors}
        currency={currency}
        maxSeats={MAX_QUANTITY - counted}
        selected={cart.seats}
        disabled={going}
        onInventory={onInventory}
        areaTickets={Object.fromEntries(countedTiers.map((tier) => [tier.id, {
          title: tier.title,
          price: formatMoney(tier.priceCents + (tier.feeCents ?? 0), locale, tier.currency),
          quantity: cart.quantities[tier.id] ?? 0,
          canAdd: tier.status === "on_sale" && (cart.quantities[tier.id] ?? 0) < tier.available && count < MAX_QUANTITY,
        }]))}
        onAreaChange={(ticketId, delta) => {
          const tier = countedTiers.find((item) => item.id === ticketId);
          if (tier && !submitting.current) dispatch({ type: "quantity", tier, delta });
        }}
        onChange={(seats) => { if (!submitting.current) dispatch({ type: "seats", seats }); }}
        tickets={countedTiers.length > 0 ? (
          <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={t("counted.title")}>
            <div className="border-b border-border p-4">
              <h3 className="font-display text-sm font-semibold">{t("counted.title")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("counted.hint")}</p>
            </div>
            <TierQuantityList tiers={countedTiers} quantities={cart.quantities} count={count} locale={locale} disabled={going} compact
              change={(tier, delta) => dispatch({ type: "quantity", tier, delta })} />
          </section>
        ) : null}
        summary={
          <section className="rounded-lg border border-border bg-card p-4" aria-label={event("tickets")}>
            <h3 className="font-display text-sm font-semibold">{event("tickets")}</h3>
            <div className="mt-2">
              {cart.seats.length > 0 || count === 0 ? (
                <SeatSelection seats={cart.seats} onRemove={(seat) => {
                  if (!submitting.current) dispatch({ type: "seats", seats: cart.seats.filter((chosen) => chosen.id !== seat.id) });
                }} />
              ) : null}
              {counted > 0 ? <ul className="mt-2 space-y-2 text-sm">
                {countedTiers.filter((tier) => cart.quantities[tier.id] > 0).map((tier) => (
                  <li key={tier.id} className="flex justify-between gap-2">
                    <span>{cart.quantities[tier.id]} × {tier.title}</span>
                    <span className="shrink-0 tabular-nums">{formatMoney(tier.priceCents * cart.quantities[tier.id], locale, currency)}</span>
                  </li>
                ))}
              </ul> : null}
            </div>
            {count > 0 ? (
              <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{event("subtotal")}</dt>
                  <dd className="tabular-nums">{formatMoney(face, locale, currency)}</dd>
                </div>
                {fees > 0 ? <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("total.fee")}</dt>
                  <dd className="tabular-nums">{formatMoney(fees, locale, currency)}</dd>
                </div> : null}
                <div className="flex justify-between gap-3 pt-1 font-semibold">
                  <dt>{t("total.total")}</dt>
                  <dd className="tabular-nums">{formatMoney(face + fees, locale, currency)}</dd>
                </div>
              </dl>
            ) : null}
            {count >= MAX_QUANTITY ? <p role="status" className="mt-3 text-xs text-muted-foreground">{t("counted.limit", { count: MAX_QUANTITY })}</p> : null}
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{event("holdNotice", { minutes: holdMinutes })}</p>
          </section>
        }
      />
    </div>
  );
}
