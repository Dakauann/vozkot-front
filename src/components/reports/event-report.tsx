"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { BreakdownTable } from "@/components/reports/breakdown-table";
import { DownloadSimple } from "@/components/icons";
import TooltipWrapper from "@/components/ui/tooltip-wrapper";
import type { Locale } from "@/i18n/config";
import { formatMoney, formatNumber } from "@/lib/format";
import { downloadAttendees, getEventReport } from "@/lib/reports/api";
import type { EventReport as Report } from "@/lib/reports/types";

/**
 * The organiser's answer to "who bought my tickets, and what do I get".
 *
 * Two numbers lead, and which one leads matters: `net` is what the organiser
 * actually receives — the face value they set — and `gross` is what buyers
 * paid, which includes our service fee. Showing the gross first would have
 * every organiser budgeting against money that was never theirs, so the net is
 * the headline and the gross sits beside it, labelled.
 */
export function EventReport({ eventId, currency = "BRL" }: { eventId: string; currency?: string }) {
  const t = useTranslations("reports");
  const tAudience = useTranslations("audience");
  const locale = useLocale() as Locale;

  const [report, setReport] = React.useState<Report | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await getEventReport(eventId);
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
        <p className="font-display text-base font-semibold text-card-foreground">{t("empty")}</p>
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

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void downloadAttendees(eventId)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover"
        >
          <DownloadSimple size={15} aria-hidden />
          {t("exportCsv")}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* The organiser's earnings, and no second money tile beside it.
            There used to be a "gross" tile here showing what buyers paid;
            it was removed because the difference between the two IS our
            commission, and subtracting one tile from another is not a
            meaningful barrier. See the money note in domain/report. */}
        <Stat label={t("totals.net")} hint={t("totals.netHint")} emphasis>
          {formatMoney(totals.netCents, locale, currency)}
        </Stat>
        <Stat label={t("totals.tickets")}>{formatNumber(totals.tickets, locale)}</Stat>
        <Stat label={t("totals.buyers")} hint={t("totals.buyersHint")}>
          {formatNumber(totals.buyers, locale)}
        </Stat>
      </div>

      {/* Refunds are reported BESIDE the sales rather than deducted from them:
          "500 sold, 12 refunded" and "488 sold" are different facts, and only
          the first is something an organiser can act on. */}
      {totals.refundedOrders > 0 ? (
        <p className="notice notice-warning notice-ink px-3 py-2 text-xs">
          {t("totals.refunded")}: {formatNumber(totals.refundedOrders, locale)} ·{" "}
          {formatMoney(totals.refundedCents, locale, currency)}
        </p>
      ) : null}

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
 * A day as the reader's locale writes it.
 *
 * Parsed as UTC noon rather than midnight: a date-only string becomes midnight
 * UTC, which in any negative offset — every Brazilian one — is the PREVIOUS day
 * locally, so a sales curve would be labelled a day early for its whole
 * audience. Noon is far enough from both edges that no offset can move it.
 */
function formatDay(day: string, locale: Locale): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(parsed);
}

function Stat({
  label,
  hint,
  emphasis,
  children,
}: {
  label: string;
  hint?: string;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          emphasis
            ? "mt-1 font-display text-2xl font-semibold tabular-nums text-card-foreground"
            : "mt-1 font-display text-xl font-semibold tabular-nums text-muted-foreground"
        }
      >
        {children}
      </p>
    </div>
  );
  return hint ? <TooltipWrapper content={hint}>{body}</TooltipWrapper> : body;
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
