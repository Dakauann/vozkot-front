"use client";

import type { ReactNode } from "react";

import { CircuitTracesWide } from "@/components/brand/circuit";

interface DashboardPageHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * The page head.
 *
 * Stacked: title, then description, then the command bar. The actions rack sits
 * at the LEFT edge under the title rather than on the far right, so the eye
 * reads title, context, commands in one column instead of tracking across.
 * A hairline closes the block whether or not there is a command bar.
 */
export function DashboardPageHeader({
  icon,
  title,
  description,
  actions,
}: DashboardPageHeaderProps) {
  return (
    <div className="relative overflow-hidden border-b border-border pb-0">
      {/* The brand's trace lines at the head of every page. The right half of
          this block is structurally empty (title, description and the command
          rack all sit left), so the ornament sits behind no text. The WIDE
          variant self-fits the band: it takes the whole free region and
          right-anchors inside it, so no stroke is ever cut mid-line whatever
          the header's height turns out to be. */}
      <CircuitTracesWide
        tone="quiet"
        className="pointer-events-none absolute inset-y-2 right-0 hidden w-[min(38%,460px)] lg:block"
      />

      <div className="flex items-center gap-2">
        <span
          className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-[18px]"
          aria-hidden="true"
        >
          {icon}
        </span>
        {/* The one place the display face meets an operator every day. Oxanium
            is semi-wide, so Inter's negative tracking comes off and 600 holds
            the weight. */}
        <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-[0.01em] text-foreground">
          {title}
        </h1>
      </div>

      {description && (
        <p className="mt-0.5 max-w-2xl text-sm leading-snug text-muted-foreground">
          {description}
        </p>
      )}

      {actions ? (
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-2">
          {actions}
        </div>
      ) : (
        <div className="pb-3" />
      )}
    </div>
  );
}
