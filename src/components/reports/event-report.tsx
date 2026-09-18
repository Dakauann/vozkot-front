"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { BreakdownTable } from "@/components/reports/breakdown-table";
import { CategoryBars, TrendArea, type ChartPoint } from "@/components/reports/charts";
import { ChartPanel, KpiStrip, type Kpi } from "@/components/reports/kpi-strip";
import { ArrowCounterClockwise, CurrencyDollar, Receipt, UsersThree, Wallet } from "@/components/icons";
import { DownloadSimple } from "@/components/icons";
import type { Locale } from "@/i18n/config";
import { formatMoney, formatNumber } from "@/lib/format";
import { downloadAttendees, getEventReport, getPortfolioReport } from "@/lib/reports/api";
import type { EventReport as Report } from "@/lib/reports/types";

/**
 * The organiser's answer to "who bought my tickets, and what do I get".
 *
 * Two numbers lead, and which one leads matters: `net` is what the organiser
 * actually receives, the face value they set, and `gross` is what buyers
 * paid, which includes our service fee. Showing the gross first would have
 * every organiser budgeting against money that was never theirs, so the net is
 * the headline and the gross sits beside it, labelled.
 */
export function EventReport({
  eventId,
  currency = "BRL",
}: {
  /**
   * The event to report on, or omitted for the organiser's whole portfolio.
   *
   * One component for both, because they are the same numbers over a different
   * set of orders: the server computes them with the same query and one clause
   * swapped. A second component would be a second place for a breakdown to be
   * labelled, formatted or rounded differently from its own total.
   */
  eventId?: string;
  currency?: string;
}) {
  const t = useTranslations("reports");
  const tAudience = useTranslations("audience");
  const locale = useLocale() as Locale;

  const [report, setReport] = React.useState<Report | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = eventId
        ? await getEventReport(eventId)
        : await getPortfolioReport();
      if (cancelled) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setReport(data.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (failed) {
    return (
      <p role="alert" className="notice notice-fault notice-ink px-3 py-2 text-sm">
        {t("loadFailed")}
      </p>
    );
  }
  if (!report) return <ReportSkeleton />;

  if (report.totals.orders === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
        <p className="font-display text-base font-semibold text-card-foreground">
          {eventId ? t("empty") : t("portfolioEmpty")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
      </div>
    );
  }

  const { totals } = report;
  // "Não informado" is a real answer and gets the same wording everywhere. The
  // gender labels come from the `audience` catalogue, the same one the sign-up
  // form uses, so a value can never read one way when asked and another when
  // reported.
  const genderLabel = (key: string) =>
    key === "unknown" || key === "undisclosed"
      ? t("notInformed")
      : tAudience(`genders.${key}` as "genders.female");

  const kpis: Kpi[] = [
    {
      key: "net", icon: Wallet, glyph: "Money",
      label: t("totals.net"), hint: t("totals.netHint"),
      value: formatMoney(totals.netCents, locale, currency),
    },
    {
      key: "tickets", icon: Receipt, glyph: "Tag",
      label: t("totals.tickets"),
      value: formatNumber(totals.tickets, locale),
    },
    {
      key: "buyers", icon: UsersThree, glyph: "UsersThree",
      label: t("totals.buyers"), hint: t("totals.buyersHint"),
      value: formatNumber(totals.buyers, locale),
    },
    {
      key: "average", icon: CurrencyDollar, glyph: "Percent",
      label: t("totals.averageTicket"),
      hint: t("totals.averageTicketHint", {
        perOrder: formatMoney(totals.averageOrderCents, locale, currency),
      }),
      value: formatMoney(totals.averageTicketCents, locale, currency),
    },
    {
      key: "orders", icon: Receipt, glyph: "Receipt",
      label: t("columns.orders"),
      value: formatNumber(totals.orders, locale),
    },
    // Refunds sit IN the row rather than in a banner below it: what went back
    // is a headline number for anybody reading this page, and a figure an
    // organiser has to scroll to find is one they discover late.
    {
      key: "refunded", icon: ArrowCounterClockwise, glyph: "ArrowCounterClockwise",
      label: t("totals.refunded"),
      value: formatMoney(totals.refundedCents, locale, currency),
      hint: formatNumber(totals.refundedOrders, locale),
      negative: totals.refundedCents > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            {eventId ? t("title") : t("portfolioTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {eventId ? t("subtitle") : t("portfolioSubtitle")}
          </p>
        </div>
        {/* The CSV streams ONE event's attendee list. There is no portfolio
            equivalent and inventing one here would export a list nobody asked
            the server for, so the button belongs to the event view only. */}
        {eventId ? (
          <button
            type="button"
            onClick={() => void downloadAttendees(eventId)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover"
          >
            <DownloadSimple size={15} aria-hidden />
            {t("exportCsv")}
          </button>
        ) : null}
      </header>

      <KpiStrip items={kpis} />

      {/* THE SHAPE FIRST, THE FIGURES BELOW. A chart answers "who is buying"
          at a glance and a table answers "exactly how many", and an organiser
          asks both, so the charts lead and the tables that were already here
          stay as the exact view and the accessible one. Nothing is computed
          twice: both read the same slices off the same response. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {report.byDay.length > 0 ? (
          <ChartPanel title={t("breakdowns.day")} hint={t("evolutionHint")} wide>
            <TrendArea
              valueLabel={t("totals.net")}
              points={report.byDay.map((day) => ({
                label: formatDay(day.day, locale),
                value: day.netCents,
                detail: formatMoney(day.netCents, locale, currency),
              }))}
            />
          </ChartPanel>
        ) : null}
        <ChartPanel title={t("breakdowns.age")} hint={t("ageHint")}>
          {/* Ordered youngest to oldest, never by size: the whole point of an
              age chart is the shape across the bands, and sorting it by
              magnitude would throw that away. */}
          <CategoryBars
            ordered
            valueLabel={t("columns.tickets")}
            points={report.byAge.map((slice) => ({
              label: t(`ageBrackets.${slice.key}` as "ageBrackets.unknown"),
              value: slice.tickets,
              detail: formatNumber(slice.tickets, locale),
            }))}
          />
        </ChartPanel>
        <ChartPanel title={t("breakdowns.gender")}>
          <CategoryBars
            valueLabel={t("columns.tickets")}
            points={report.byGender.map((slice) => ({
              label: genderLabel(slice.key),
              value: slice.tickets,
              detail: formatNumber(slice.tickets, locale),
            }))}
          />
        </ChartPanel>
        {report.byUf.length > 0 ? (
          <ChartPanel title={t("breakdowns.uf")}>
            <CategoryBars
              valueLabel={t("columns.tickets")}
              points={topPoints(
                report.byUf.map((slice) => ({
                  label: slice.key === "unknown" ? t("notInformed") : slice.key,
                  value: slice.tickets,
                  detail: formatNumber(slice.tickets, locale),
                })),
              )}
            />
          </ChartPanel>
        ) : null}
        {report.byTier.length > 0 ? (
          <ChartPanel title={t("breakdowns.tier")}>
            <CategoryBars
              valueLabel={t("columns.tickets")}
              points={topPoints(
                report.byTier.map((slice) => ({
                  label: slice.label || slice.key,
                  value: slice.tickets,
                  detail: formatNumber(slice.tickets, locale),
                })),
              )}
            />
          </ChartPanel>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          title={t("breakdowns.gender")}
          keyColumn={t("columns.gender")}
          slices={report.byGender}
          labelFor={genderLabel}
          currency={currency}
          total={totals.tickets}
        />
        <BreakdownTable
          title={t("breakdowns.age")}
          keyColumn={t("columns.age")}
          slices={report.byAge}
          labelFor={(key) => t(`ageBrackets.${key}` as "ageBrackets.unknown")}
          currency={currency}
          total={totals.tickets}
        />
        <BreakdownTable
          title={t("breakdowns.uf")}
          keyColumn={t("columns.uf")}
          slices={report.byUf}
          labelFor={(key) => (key === "unknown" ? t("notInformed") : key)}
          currency={currency}
          total={totals.tickets}
        />
        <BreakdownTable
          title={t("breakdowns.city")}
          keyColumn={t("columns.city")}
          slices={report.byCity}
          labelFor={(key) => (key === "unknown" ? t("notInformed") : key)}
          currency={currency}
          total={totals.tickets}
        />
        <BreakdownTable
          title={t("breakdowns.tier")}
          keyColumn={t("columns.tier")}
          slices={report.byTier}
          // The tier's title as it was when it sold, which the server carries
          // as the label; the id is the fallback for a tier since deleted.
          labelFor={(key, label) => label || key}
          currency={currency}
          total={totals.tickets}
        />
        <BreakdownTable
          title={t("breakdowns.day")}
          keyColumn={t("columns.day")}
          slices={report.byDay.map((day) => ({
            key: day.day,
            orders: day.orders,
            tickets: day.tickets,
            netCents: day.netCents,
          }))}
          labelFor={(key) => formatDay(key, locale)}
          currency={currency}
          total={totals.tickets}
        />
      </div>
    </div>
  );
}

/**
 * The biggest few, and never a generated hue for the tail.
 *
 * A national tour reaches hundreds of cities and every state in Brazil; a bar
 * per row is not a chart anybody reads. The rest are not dropped: the table
 * below carries every row, so this is the chart being a summary and the table
 * being the record.
 */
const TOP = 8;

function topPoints(points: ChartPoint[]): ChartPoint[] {
  return [...points].sort((a, b) => b.value - a.value).slice(0, TOP);
}

/**
 * A day as the reader's locale writes it.
 *
 * Parsed as UTC noon rather than midnight: a date-only string becomes midnight
 * UTC, which in any negative offset, every Brazilian one, is the PREVIOUS day
 * locally, so a sales curve would be labelled a day early for its whole
 * audience. Noon is far enough from both edges that no offset can move it.
 */
function formatDay(day: string, locale: Locale): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(parsed);
}

function ReportSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-lg bg-accent-hover" />
      ))}
    </div>
  );
}
