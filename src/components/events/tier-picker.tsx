"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { TierQuantityList } from "@/components/events/tier-quantity-list";
import type { Locale } from "@/i18n/config";
import { useRouter } from "@/i18n/routing";
import { intentParams, MAX_QUANTITY } from "@/lib/checkout/intent";
import { useAuthDialog } from "@/contexts/auth-dialog-context";
import { formatMoney } from "@/lib/format";
import type { TicketTier } from "@/lib/events/types";

/**
 * The buy panel: pick a tier, pick a quantity, go to checkout.
 *
 * The choice is carried to checkout in the URL rather than in memory, and that
 * is the point of the design. Checkout may require a sign-in, and a sign-in is
 * a navigation: possibly to another tab, possibly back tomorrow. Anything held
 * in React state is gone by then, and a buyer who has just chosen two Camarote
 * tickets and signed in should not arrive at an empty page and have to choose
 * again. A URL survives a redirect, a refresh, a shared link and the back
 * button.
 */
export function TierPicker({
  tiers,
  eventSlug,
  locale,
  holdMinutes,
}: {
  tiers: TicketTier[];
  eventSlug: string;
  locale: Locale;
  /** How long a reservation lasts once checkout starts. */
  holdMinutes: number;
}) {
  const t = useTranslations("event");
  const router = useRouter();
  const { requireAuth } = useAuthDialog();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const selected = useMemo(
    () =>
      tiers
        .map((tier) => ({ tier, quantity: quantities[tier.id] ?? 0 }))
        .filter((entry) => entry.quantity > 0),
    [tiers, quantities],
  );

  const total = selected.reduce((sum, entry) => sum + entry.tier.priceCents * entry.quantity, 0);
  // The fee across the basket, from the per-ticket figure the server priced.
  // Summed from the unit rather than computed from the subtotal, for the same
  // reason the server does it that way: a fee taken on the total can differ by
  // a centavo from the sum of the lines, and this panel has to agree with the
  // order that follows it.
  const totalFee = selected.reduce(
    (sum, entry) => sum + (entry.tier.feeCents ?? 0) * entry.quantity,
    0,
  );
  const count = selected.reduce((sum, entry) => sum + entry.quantity, 0);
  const currency = tiers[0]?.currency ?? "BRL";

  if (tiers.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">
        {t("noTiers")}
      </p>
    );
  }

  const change = (tier: TicketTier, delta: number) => {
    setQuantities((current) => {
      const now = current[tier.id] ?? 0;
      // Never past what is actually left, and never past the per-order cap the
      // API enforces anyway; refusing here costs a round trip and a rejection
      // the buyer cannot act on.
      // Never past what is left of THIS tier, and never past what the whole
      // basket may hold. The order cap counts every tier, so the room left for
      // this one shrinks as the others fill, which is the arithmetic that
      // stops an event with three tiers having three times the intended
      // ceiling.
      const chosenElsewhere = Object.entries(current)
        .filter(([id]) => id !== tier.id)
        .reduce((sum, [, quantity]) => sum + quantity, 0);
      const ceiling = Math.min(tier.available, MAX_PER_ORDER - chosenElsewhere);
      const next = Math.min(Math.max(now + delta, 0), Math.max(ceiling, 0));
      return { ...current, [tier.id]: next };
    });
  };

  const goToCheckout = async () => {
    if (selected.length === 0) return;
    // The session is asked for HERE, before the navigation, rather than on the
    // checkout page after it. The dialog opens over this panel, the chosen
    // quantities stay on screen behind it, and the buyer lands on checkout
    // already signed in, instead of arriving at a "sign in first" wall having
    // lost the selection they just made.
    if (!(await requireAuth("checkout"))) return;
    // EVERY selected tier, which is what this panel has been letting people
    // choose all along. It used to send only the first and drop the rest in
    // silence: the buyer picked two Pista and one Camarote, paid for the
    // Pista, and never found out the Camarote had gone. One order now covers
    // the whole basket: one hold, one PIX code, one receipt.
    const params = intentParams({
      lines: selected.map((entry) => ({ ticketId: entry.tier.id, quantity: entry.quantity })),
      eventSlug,
    });
    router.push(`/checkout?${params.toString()}`);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <TierQuantityList tiers={tiers} quantities={quantities} count={count} locale={locale} change={change} />

      <div className="border-t border-border bg-muted p-4">
        {totalFee > 0 ? (
          <div className="mb-2 flex flex-col gap-1 border-b border-border pb-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{t("subtotal")}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatMoney(total, locale, currency)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{t("serviceFee")}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatMoney(totalFee, locale, currency)}
              </span>
            </div>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{t("total")}</span>
          <span className="font-display text-lg font-semibold tabular-nums text-card-foreground">
            {formatMoney(total + totalFee, locale, currency)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void goToCheckout()}
          disabled={count === 0}
          className="mt-3 h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary-hover hover:shadow-[var(--elev-button-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {count === 0 ? t("pickATier") : t("buy", { count })}
        </button>

        {/* Said before the buyer commits, not after. Neither Sympla nor
            Eventbrite shows this, and both leave people staring at a page whose
            reservation has silently expired. */}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {t("holdNotice", { minutes: holdMinutes })}
        </p>
      </div>
    </div>
  );
}

/**
 * The API refuses more than this per order, counting every tier; the stepper
 * should too. Read from the checkout module rather than restated, so the panel
 * and the link it builds can never disagree about the ceiling.
 */
const MAX_PER_ORDER = MAX_QUANTITY;

