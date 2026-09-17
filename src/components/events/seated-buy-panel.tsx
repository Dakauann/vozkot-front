"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthDialog } from "@/contexts/auth-dialog-context";
import { intentParams, MAX_QUANTITY } from "@/lib/checkout/intent";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { TicketTier } from "@/lib/events/types";
import { SeatPicker, SeatSelection } from "@/components/seating/seat-picker";
import { Button } from "@/components/ui/button";
import type { Seat } from "@/lib/seating/api";

/**
 * The buy panel for an event that sells named chairs.
 *
 * The counted panel next door asks "how many"; this one asks "which", and the
 * difference runs all the way down: a quantity is a number the server can
 * satisfy from any stock, and a chair is one row that either is or is not
 * yours.
 *
 * It carries the selection to checkout in the URL, exactly as the counted
 * panel does and for the same reason: choosing seats happens before a sign-in,
 * a sign-in is a navigation, and a buyer who picked FILA K 11 and 12 and then
 * signed in must not come back to an empty chart.
 */
export function SeatedBuyPanel({
  eventId,
  tiers,
  eventSlug,
  locale,
  holdMinutes,
}: {
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

  const [selected, setSelected] = React.useState<Seat[]>([]);
  const [going, setGoing] = React.useState(false);

  const sectors = React.useMemo(
    () =>
      tiers.map((tier) => ({
        ticketId: tier.id,
        title: tier.title,
        priceCents: tier.priceCents,
        feeCents: tier.feeCents,
      })),
    [tiers],
  );

  const currency = tiers[0]?.currency ?? "BRL";
  const priceOf = React.useCallback(
    (ticketId: string) => tiers.find((tier) => tier.id === ticketId),
    [tiers],
  );

  // Summed per chair from the unit figures the server priced, never from a
  // total times a rate. It is the same discipline the counted panel follows and
  // the same reason: a fee taken on a basket total can differ by a centavo from
  // the sum of its lines, and this panel has to agree with the order it
  // produces.
  const face = selected.reduce(
    (sum, seat) => sum + (priceOf(seat.ticketId)?.priceCents ?? 0),
    0,
  );
  const fees = selected.reduce(
    (sum, seat) => sum + (priceOf(seat.ticketId)?.feeCents ?? 0),
    0,
  );

  const proceed = async () => {
    if (selected.length === 0) return;
    setGoing(true);
    // The session is required before leaving, so a buyer who is already signed
    // in never sees a wall, and one who is not keeps their chairs through it.
    if (!(await requireAuth("checkout"))) {
      setGoing(false);
      return;
    }
    // Grouped by tier, because that is the shape a basket line has: one tier,
    // its chairs, and a quantity derived from them.
    const byTier = new Map<string, string[]>();
    for (const seat of selected) {
      const existing = byTier.get(seat.ticketId);
      if (existing) existing.push(seat.id);
      else byTier.set(seat.ticketId, [seat.id]);
    }
    const params = intentParams({
      lines: [...byTier.entries()].map(([ticketId, seatIds]) => ({
        ticketId,
        quantity: seatIds.length,
        seatIds,
      })),
      eventSlug,
    });
    router.push(`/checkout?${params.toString()}`);
  };

  if (tiers.length === 0) return null;

  return (
    <div className="space-y-4">
      <SeatPicker
        eventId={eventId}
        sectors={sectors}
        currency={currency}
        maxSeats={MAX_QUANTITY}
        selected={selected}
        onChange={setSelected}
      />

      <div className="rounded-[--radius] border border-border bg-card p-4">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {t("selection.title")}
        </h3>
        <div className="mt-2">
          <SeatSelection
            seats={selected}
            onRemove={(seat) =>
              setSelected((current) => current.filter((chosen) => chosen.id !== seat.id))
            }
          />
        </div>

        {selected.length > 0 ? (
          <>
            {/* The split, stated. The buyer is about to be charged face plus
                fee, and a total that appeared without explanation is what
                produces a chargeback. */}
            <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("total.tickets", { count: selected.length })}
                </dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(face, locale, currency)}
                </dd>
              </div>
              {fees > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t("total.fee")}</dt>
                  <dd className="tabular-nums text-foreground">
                    {formatMoney(fees, locale, currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="font-semibold text-foreground">{t("total.total")}</dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-foreground">
                  {formatMoney(face + fees, locale, currency)}
                </dd>
              </div>
            </dl>

            <Button
              type="button"
              size="lg"
              disabled={going}
              onClick={() => void proceed()}
              className="mt-3 h-12 w-full"
            >
              {t("proceed", { count: selected.length })}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {event("holdNotice", { minutes: holdMinutes })}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
