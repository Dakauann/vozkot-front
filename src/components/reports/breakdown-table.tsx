"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { DownloadSimple } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ReportSlice } from "@/lib/reports/types";

/**
 * One breakdown, as a table.
 *
 * Four of these make the report — by gender, age, state and ticket — and they
 * share a component because they are the same question asked of four columns.
 * The alternative, four near-identical tables, is four places to fix a column
 * nobody noticed was missing from one of them.
 *
 * Why a table rather than a chart: the numbers here are read to be acted on
 * ("how many from São Paulo, exactly"), and a bar whose value has to be
 * recovered by hovering is worse at that than the number itself. The share bar
 * behind each row is there for the shape, underneath the number, not instead
 * of it.
 */
export function BreakdownTable({
  title,
  keyColumn,
  slices,
  labelFor,
  currency,
  total,
  onExport,
}: {
  title: string;
  /** The heading over the first column: "Sexo", "Idade", "Estado". */
  keyColumn: string;
  slices: ReportSlice[];
  /** Turns a stable key into the reader's language. */
  labelFor: (key: string, label?: string) => string;
  currency: string;
  /** Tickets across every slice, the denominator for the share bar. */
  total: number;
  onExport?: () => void;
}) {
  const t = useTranslations("reports");
  const locale = useLocale() as Locale;

  if (slices.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-display text-base font-semibold text-card-foreground">{title}</h3>
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-xs font-medium text-foreground hover:bg-accent-hover"
          >
            <DownloadSimple size={14} aria-hidden />
            {t("export")}
          </button>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left">
              <th scope="col" className="px-4 py-2 font-semibold text-muted-foreground">
                {keyColumn}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold text-muted-foreground">
                {t("columns.tickets")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold text-muted-foreground">
                {t("columns.net")}
              </th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => {
              const share = total > 0 ? slice.tickets / total : 0;
              return (
                <tr key={slice.key} className="border-b border-border last:border-b-0">
                  <th scope="row" className="relative px-4 py-2 text-left font-normal text-foreground">
                    {/* The share, drawn behind the label rather than as its own
                        column: it is a texture for scanning, and giving it a
                        column would imply a precision a bar does not have. */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-primary/10"
                      style={{ width: `${Math.round(share * 100)}%` }}
                    />
                    <span className="relative">{labelFor(slice.key, slice.label)}</span>
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {formatNumber(slice.tickets, locale)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {formatMoney(slice.netCents, locale, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
