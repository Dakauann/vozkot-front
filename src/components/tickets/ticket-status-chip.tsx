"use client";

import { Clock, PencilSimple, Prohibit, SealCheck } from "@/components/icons";
import { useTranslations } from "next-intl";

import type { TicketStatus } from "@/lib/tickets/types";
import { cn } from "@/lib/utils";

/**
 * Sale state, and only sale state.
 *
 * Four states, four inks: a draft is quiet because nobody can buy it, on sale
 * is the healthy one, sold out is a warning the operator may want to act on,
 * and cancelled is struck out of the running entirely. Colour alone never
 * carries it — each state keeps its own glyph and its own word.
 */
const config = {
  draft: { icon: PencilSimple, className: "text-muted-foreground" },
  on_sale: { icon: SealCheck, className: "text-healthy-ink" },
  sold_out: { icon: Clock, className: "text-warning-ink" },
  cancelled: { icon: Prohibit, className: "text-destructive-ink" },
} satisfies Record<TicketStatus, { icon: typeof Clock; className: string }>;

export function TicketStatusChip({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const t = useTranslations("tickets.status");
  const item = config[status];
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        item.className,
        className,
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
