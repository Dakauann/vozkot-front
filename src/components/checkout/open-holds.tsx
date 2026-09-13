"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/config";
import { cancelOrder, listOrders, type Order } from "@/lib/checkout/api";
import { formatMoney } from "@/lib/format";

/**
 * The way out of "you are already holding the maximum".
 *
 * Telling a buyer they have hit a limit and stopping there is a dead end: the
 * limit is about orders they cannot see from this page, and the only way to
 * satisfy it — give one of them up — is an action they have to go and find
 * somewhere else, by which time the basket they were buying is gone.
 *
 * So the refusal shows the orders that caused it, and lets them release one on
 * the spot. The cap is not weakened by this; it is the same cap, with the
 * remedy attached to the sentence that mentions it.
 *
 * Nothing here can spend money or take inventory. Cancelling returns stock and
 * is refused by the API for anything already paid, so the worst a confused tap
 * can do is give up a reservation the buyer was going to lose anyway.
 */
export function OpenHolds({
  locale,
  onReleased,
}: {
  locale: Locale;
  /** Called after an order is given up, so the caller can retry the basket. */
  onReleased: () => void;
}) {
  const t = useTranslations("checkout");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await listOrders({ status: "pending_payment", limit: 10 });
      if (cancelled) return;
      setOrders(data?.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const release = async (id: string) => {
    setReleasing(id);
    const { error } = await cancelOrder(id);
    setReleasing(null);
    if (error) return;
    setOrders((current) => current?.filter((order) => order.id !== id) ?? null);
    onReleased();
  };

  if (orders === null) {
    return (
      <p className="mt-4 text-sm text-muted-foreground" role="status">
        {t("loadingHolds")}
      </p>
    );
  }
  if (orders.length === 0) return null;

  return (
    <div className="mt-5 text-left">
      <p className="text-sm font-semibold text-foreground">{t("openHoldsTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("openHoldsBody")}</p>

      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {orders.map((order) => (
          <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-card-foreground">
                {order.event?.name ?? t("unknownEvent")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {order.items.map((item) => `${item.quantity}× ${item.ticketTitle}`).join(" · ")}
                {" · "}
                {formatMoney(order.totalCents, locale, order.currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => release(order.id)}
              disabled={releasing !== null}
              className="h-8 shrink-0 rounded-md border border-border-strong bg-card px-3 text-xs font-medium text-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {releasing === order.id ? t("releasing") : t("releaseHold")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
