"use client";

import {
  ArrowCounterClockwise,
  Clock,
  Prohibit,
  SealCheck,
  Warning,
} from "@/components/icons";
import { useTranslations } from "next-intl";

import type { Order } from "@/lib/checkout/api";
import { cn } from "@/lib/utils";

/**
 * Where an order stands, in a word, a glyph and an ink.
 *
 * Colour never carries it alone: each state keeps its own icon and its own
 * label, because "paid" and "refunded" would otherwise be two greens a
 * colour-blind buyer has to guess between on the one screen that is about their
 * money.
 *
 * refund_required deliberately reads as a WARNING rather than as a failure. It
 * is the honest outcome of a payment that landed after the hold lapsed and the
 * tickets were resold: the buyer did nothing wrong, they are owed money, and a
 * red "failed" would tell them the opposite of what happened.
 */
const config = {
  pending_payment: { icon: Clock, className: "text-warning-ink" },
  paid: { icon: SealCheck, className: "text-healthy-ink" },
  expired: { icon: Clock, className: "text-muted-foreground" },
  cancelled: { icon: Prohibit, className: "text-muted-foreground" },
  failed: { icon: Prohibit, className: "text-destructive-ink" },
  refunded: { icon: ArrowCounterClockwise, className: "text-info-ink" },
  refund_required: { icon: Warning, className: "text-warning-ink" },
} satisfies Record<Order["status"], { icon: typeof Clock; className: string }>;

export function OrderStatusChip({
  status,
  className,
}: {
  status: Order["status"];
  className?: string;
}) {
  const t = useTranslations("orders.status");
  const item = config[status];
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold",
        item.className,
        className,
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
