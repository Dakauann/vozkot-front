"use client";

import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import type { TicketTier } from "@/lib/events/types";
import { formatMoney } from "@/lib/format";
import { MAX_QUANTITY } from "@/lib/checkout/intent";

/** Quantity controls shared by general-admission and mixed seating events. */
export function TierQuantityList({ tiers, quantities, count, locale, change, disabled = false, compact = false }: {
  tiers: TicketTier[];
  quantities: Record<string, number>;
  /** Includes named seats, when the event sells both kinds of admission. */
  count: number;
  locale: Locale;
  change: (tier: TicketTier, delta: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("event");
  return (
      <ul className="divide-y divide-border">
        {tiers.map((tier) => {
          const quantity = quantities[tier.id] ?? 0;
          const soldOut = tier.available <= 0 || tier.status !== "on_sale";
          const atCeiling =
            quantity >= tier.available || count >= MAX_QUANTITY;

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
                  {compact && tier.description ? (
                    <details>
                      <summary className="cursor-pointer rounded-sm font-semibold text-card-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{tier.title}</summary>
                      <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                    </details>
                  ) : <p className="font-semibold text-card-foreground">{tier.title}</p>}
                  {!compact && tier.description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{tier.description}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-healthy-ink">
                    {tier.priceCents === 0 ? t("free") : formatMoney(tier.priceCents, locale, tier.currency)}
                  </p>
                  {/* Named on the tier itself, where the buyer first reads a
                      price, rather than saved for the checkout. A total that
                      appears only at the last step is the single largest cause
                      of an abandoned cart. */}
                  {tier.feeCents ? (
                    <p className="text-xs text-muted-foreground">
                      {"+ "}
                      {formatMoney(tier.feeCents, locale, tier.currency)} {t("serviceFee")}
                    </p>
                  ) : null}
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
                        disabled={disabled}
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
                      disabled={disabled || atCeiling}
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
  );
}

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
