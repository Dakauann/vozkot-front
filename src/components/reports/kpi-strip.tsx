"use client";

import * as React from "react";

import { glyphPlate } from "@/components/icons/glyph-plates";
import type { Icon } from "@/components/icons/types";
import { cn } from "@/lib/utils";

/**
 * The headline numbers, as a tile row.
 *
 * THE ROW LEADS THE PAGE, and it is the first thing the squint test should
 * find: an organiser opens these screens asking "how am I doing", and the
 * answer is four to six numbers. Everything below is the elaboration.
 *
 * Each tile carries its glyph on the plate that glyph wears PRODUCT-WIDE, from
 * the same table the rest of the family uses, so the colour is a mark somebody
 * can learn rather than a decision taken per page. The number is the biggest
 * thing on the tile; the label is small and the hint is smaller still, because
 * a row where every element competes is a row nobody reads at a squint.
 */
export interface Kpi {
  key: string;
  /** The glyph, looked up in the product's plate table for its colour. */
  icon: Icon;
  /** The glyph's own name, which is what the plate is keyed on. */
  glyph: string;
  label: string;
  /** Already formatted: money as money, counts as counts. */
  value: string;
  hint?: string;
  /**
   * A figure that is bad news rather than merely large: a refund total, a
   * negative balance. It takes the debit ink; it does NOT take a status plate,
   * because the plate belongs to the glyph.
   */
  negative?: boolean;
}

export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        // Two up on a phone, then four: a six-tile row at three columns leaves
        // an orphan, and these are read as a block rather than scanned one by
        // one.
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-lg border border-border bg-card p-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-[--radius]",
                glyphPlate(item.glyph),
              )}
            >
              <item.icon className="size-4" weight="fill" />
            </span>
            <p className="truncate text-[0.6875rem] font-semibold leading-tight text-muted-foreground">
              {item.label}
            </p>
          </div>
          <p
            className={cn(
              "mt-1.5 truncate font-display text-xl font-semibold tracking-tight tabular-nums",
              item.negative ? "text-destructive-ink" : "text-foreground",
            )}
            title={item.value}
          >
            {item.value}
          </p>
          {item.hint ? (
            <p className="mt-0.5 truncate text-[0.6875rem] leading-tight text-muted-foreground">
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * A chart in the same card the tiles and tables use.
 *
 * `wide` spans the row: the evolution chart is the one somebody stares at, and
 * squeezing it into a half-width column to keep a tidy grid is the layout
 * serving itself rather than the reading.
 */
export function ChartPanel({
  title,
  hint,
  wide,
  when = true,
  children,
  className,
}: {
  title: string;
  hint?: string;
  wide?: boolean;
  /**
   * Whether this breakdown has anything to say.
   *
   * The guard lives HERE rather than in a conditional around each call,
   * because what it protects is the heading, not the chart: a chart with no
   * rows renders nothing, but its panel still draws a title and a frame, and
   * an empty framed card reads as "this failed" rather than as "nothing has
   * happened in this cut yet".
   */
  when?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!when) return null;
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border bg-card p-4",
        wide && "lg:col-span-2",
        className,
      )}
    >
      <h3 className="legend">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 min-w-0">{children}</div>
    </section>
  );
}
