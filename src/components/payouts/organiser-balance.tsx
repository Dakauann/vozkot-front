"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/config";
import { formatLongDateTime, formatMoney } from "@/lib/format";
import { getBalance, listLedger } from "@/lib/payouts/api";
import type { Balance, LedgerEntry, LedgerKind } from "@/lib/payouts/types";
import { cn } from "@/lib/utils";
import { ChartPanel, KpiStrip, type Kpi } from "@/components/reports/kpi-strip";
import { TrendArea } from "@/components/reports/charts";
import { Clock, ShieldCheck, Wallet } from "@/components/icons";

/**
 * What the organiser is owed, and the statement behind it.
 *
 * THE NUMBERS ARE NOT INVENTED HERE. Every figure comes from the server's own
 * sum over its ledger; this screen formats and labels, and computes nothing. A
 * balance recomputed in a browser is a second implementation of the arithmetic
 * that decides what somebody is paid, and the two would eventually disagree in
 * front of the person whose money it is.
 *
 * A NEGATIVE AVAILABLE BALANCE IS SHOWN AS NEGATIVE. Refunds are counted the
 * moment they happen while the sales they reverse are not yet due, so a balance
 * below zero is a real state and means refunds have outrun settlements. Clamping
 * it at zero would show an organiser a position they do not have, and would hide
 * exactly the case they most need to see.
 */
export function OrganiserBalance({ eventId }: { eventId?: string }) {
  const t = useTranslations("payouts");
  const locale = useLocale() as Locale;

  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [entries, setEntries] = React.useState<LedgerEntry[] | null>(null);
  const [total, setTotal] = React.useState(0);
  /**
   * The instant the statement was read, captured once.
   *
   * One reference point for every row rather than each asking the clock as it
   * renders: rows either side of a settlement boundary would otherwise disagree
   * about whether "now" is before or after it, and reading the clock during
   * render is impure besides.
   */
  const [readAt, setReadAt] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      const [position, statement] = await Promise.all([getBalance(), listLedger({ eventId, limit: 50 })]);
      if (!live) return;
      if (position.error || !position.data || statement.error || !statement.data) {
        setFailed(true);
        return;
      }
      setBalance(position.data);
      setEntries(statement.data.data);
      setTotal(statement.data.total);
      setReadAt(Date.now());
      setFailed(false);
    })();
    return () => {
      live = false;
    };
  }, [eventId, attempt]);

  if (failed) {
    return (
      <div role="alert" className="notice notice-fault notice-ink rounded-[--radius] p-4 text-sm">
        <p>{t("failed")}</p>
        <button
          type="button"
          className="mt-2 font-medium underline underline-offset-4"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (!balance || !entries) return <BalanceSkeleton />;

  const currency = balance.currency || "BRL";

  const figures: Kpi[] = [
    {
      key: "available", icon: Wallet, glyph: "Money",
      label: t("available"), hint: t("availableHint"),
      value: formatMoney(balance.availableCents, locale, currency),
      // A shortfall is the case this page exists to surface, so it is marked
      // rather than clamped. See the note at the top of this file.
      negative: balance.availableCents < 0,
    },
    {
      key: "pending", icon: Clock, glyph: "Clock",
      label: t("pending"), hint: t("pendingHint"),
      value: formatMoney(balance.pendingCents, locale, currency),
    },
    {
      key: "reserved", icon: ShieldCheck, glyph: "ShieldCheck",
      label: t("reserved"), hint: t("reservedHint"),
      value: formatMoney(balance.reservedCents, locale, currency),
    },
    {
      key: "total", icon: Wallet, glyph: "Wallet",
      label: t("total"), hint: t("totalHint"),
      value: formatMoney(balance.totalCents, locale, currency),
      negative: balance.totalCents < 0,
    },
  ];

  // Credits per day, oldest first. Debits are left out on purpose: an area
  // that dipped below zero on a refund would read as "we earned less that
  // day" rather than "money went back", and the statement below already says
  // which is which.
  const byDay = new Map<string, number>();
  for (const entry of entries) {
    if (entry.amountCents <= 0) continue;
    const day = entry.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + entry.amountCents);
  }
  const trend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cents]) => ({
      label: formatLongDateTime(`${day}T12:00:00Z`, locale).split(",")[0] ?? day,
      value: cents,
      detail: formatMoney(cents, locale, currency),
    }));
  // One day is not a curve. The flag is read twice below, by the chart and by
  // the column the statement takes when the chart is not there.
  const hasTrend = trend.length > 1;

  return (
    <div className="flex flex-col gap-5">
      <KpiStrip items={figures} />

      {/* The curve and the statement side by side on a wide screen, because
          they are one question asked twice: the shape of the money, and the
          rows it is made of. Stacked, the chart stretched to the full width of
          a desktop display for 200px of height, which is a pancake nobody can
          read a slope off, and it pushed the statement below the fold. */}
      <div className={cn("grid gap-4", hasTrend && "xl:grid-cols-12")}>
        {hasTrend ? (
          <ChartPanel title={t("trend")} hint={t("trendHint")} className="xl:col-span-5">
            <TrendArea valueLabel={t("available")} points={trend} height={240} />
          </ChartPanel>
        ) : null}

        <section
          aria-labelledby="statement-heading"
          className={cn("flex min-w-0 flex-col gap-3", hasTrend && "xl:col-span-7")}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h3 id="statement-heading" className="font-display text-base font-semibold text-foreground">
              {t("statement")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("entryCount", { count: total })}</p>
          </div>
          {entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {entries.map((entry) => (
                <Row key={entry.id} entry={entry} locale={locale} currency={currency} readAt={readAt} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Said once, in the organiser's own words, rather than left to be
          discovered when the money does not arrive on the day they expected. */}
      <p className="max-w-[72ch] text-xs leading-5 text-muted-foreground">{t("schedule")}</p>
    </div>
  );
}

function Row({
  entry,
  locale,
  currency,
  readAt,
}: {
  entry: LedgerEntry;
  locale: Locale;
  currency: string;
  /** When the statement was read; see the parent. */
  readAt: number;
}) {
  const t = useTranslations("payouts");
  const credit = entry.amountCents >= 0;
  const due = new Date(entry.availableAt).getTime() <= readAt;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{kindLabel(t, entry.kind)}</p>
        <p className="text-xs text-muted-foreground">
          {formatLongDateTime(entry.createdAt, locale)}
          {entry.orderId ? ` · ${entry.orderId}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            credit ? "text-foreground" : "text-destructive-ink",
          )}
        >
          {credit ? "+" : "−"}
          {formatMoney(Math.abs(entry.amountCents), locale, currency)}
        </p>
        {/* When it becomes payable, which is the question the amount alone does
            not answer and the reason this table exists at all. */}
        <p className="text-xs text-muted-foreground">
          {due ? t("availableNow") : t("availableOn", { date: formatLongDateTime(entry.availableAt, locale) })}
        </p>
      </div>
    </li>
  );
}

/**
 * A kind the client does not know renders as its own name rather than blank, so
 * a kind added on the server appears as an unfamiliar label instead of a line
 * of money with no explanation.
 */
function kindLabel(t: ReturnType<typeof useTranslations>, kind: LedgerKind): string {
  const known: LedgerKind[] = [
    "sale",
    "reserve",
    "refund",
    "chargeback",
    "gateway_fee",
    "payout",
    "adjustment",
  ];
  return known.includes(kind) ? t(`kinds.${kind}`) : kind;
}

function BalanceSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-20 rounded-[--radius] bg-muted" />
            <div className="mt-2 h-6 w-28 rounded-[--radius] bg-muted" />
            <div className="mt-2 h-3 w-full rounded-[--radius] bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-40 rounded-lg border border-border bg-card" />
    </div>
  );
}
