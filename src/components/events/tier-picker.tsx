"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { Locale } from "@/i18n/config";
import { useRouter } from "@/i18n/routing";
import { intentParams, MAX_QUANTITY } from "@/lib/checkout/intent";
import { formatMoney } from "@/lib/format";
import type { TicketTier } from "@/lib/events/types";

/**
 * The buy panel: pick a tier, pick a quantity, go to checkout.
 *
 * The choice is carried to checkout in the URL rather than in memory, and that
 * is the point of the design. Checkout may require a sign-in, and a sign-in is
 * a navigation — possibly to another tab, possibly back tomorrow. Anything held
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
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const selected = useMemo(
    () =>
      tiers
        .map((tier) => ({ tier, quantity: quantities[tier.id] ?? 0 }))
        .filter((entry) => entry.quantity > 0),
    [tiers, quantities],
  );

  const total = selected.reduce((sum, entry) => sum + entry.tier.priceCents * entry.quantity, 0);
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
      // API enforces anyway — refusing here costs a round trip and a rejection
      // the buyer cannot act on.
      // Never past what is left of THIS tier, and never past what the whole
      // basket may hold. The order cap counts every tier, so the room left for
      // this one shrinks as the others fill — which is the arithmetic that
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

  const goToCheckout = () => {
    if (selected.length === 0) return;
    // EVERY selected tier, which is what this panel has been letting people
    // choose all along. It used to send only the first and drop the rest in
    // silence — the buyer picked two Pista and one Camarote, paid for the
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
      <ul className="divide-y divide-border">
        {tiers.map((tier) => {
          const quantity = quantities[tier.id] ?? 0;
          const soldOut = tier.available === 0;
          const atCeiling =
            quantity >= tier.available || count >= MAX_PER_ORDER;

          return (
            <li
              key={tier.id}
              className={`relative p-4 transition-colors duration-150 ${
                quantity > 0 ? "bg-primary-subtle" : "bg-card"
              }`}
            >
              {quantity > 0 ? (
                <span className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-primary" aria-hidden />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-card-foreground">{tier.title}</p>
                  {tier.description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{tier.description}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-healthy-ink">
                    {tier.priceCents === 0 ? t("free") : formatMoney(tier.priceCents, locale, tier.currency)}
                  </p>
                  {/* Scarcity only when it is true and useful. "3 left" moves
                      people; "487 left" is noise. */}
                  {!soldOut && tier.available <= 10 ? (
                    <p className="mt-1 text-xs font-medium text-warning-ink">
                      {t("fewLeft", { count: tier.available })}
                    </p>
                  ) : null}
                </div>

                {soldOut ? (
                  <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("soldOut")}
                  </span>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* No minus at zero. A control that does nothing is a
                        control a person tries anyway and learns to distrust. */}
                    {quantity > 0 ? (
                      <Stepper
                        label={t("decrease", { tier: tier.title })}
                        onClick={() => change(tier, -1)}
                      >
                        −
                      </Stepper>
                    ) : (
                      <span className="h-9 w-9" aria-hidden />
                    )}
                    <span
                      className="w-6 text-center text-sm font-semibold tabular-nums"
                      aria-live="polite"
                      aria-atomic
                    >
                      {quantity}
                    </span>
                    <Stepper
                      label={t("increase", { tier: tier.title })}
                      onClick={() => change(tier, 1)}
                      disabled={atCeiling}
                    >
                      +
                    </Stepper>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border bg-muted p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{t("total")}</span>
          <span className="font-display text-lg font-semibold tabular-nums text-card-foreground">
            {formatMoney(total, locale, currency)}
          </span>
        </div>

        <button
          type="button"
          onClick={goToCheckout}
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

function Stepper({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-control-edge bg-background text-lg leading-none text-foreground transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-accent-hover active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
