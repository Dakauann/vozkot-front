"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { DownloadSimple, MagnifyingGlass } from "@/components/icons";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { Field, SelectField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { downloadAttendees, listAttendees } from "@/lib/reports/api";
import type { Attendee } from "@/lib/reports/types";
import type { Ticket } from "@/lib/tickets/types";

/** How many rows one page of the table holds. */
const PAGE_SIZE = 50;

/**
 * The list of people who bought, and the export.
 *
 * This is the screen where the privacy posture is visible, so it says what it
 * is doing: the document is masked, and the date of birth and phone number are
 * not here at all. An organiser has to be able to contact a buyer and check
 * them in at the door; they have no operational use for a full CPF, and a
 * spreadsheet of them is what turns one leak into identity theft.
 *
 * The export is an ordinary link rather than a fetch: the endpoint streams the
 * file with its own filename, so letting the browser navigate to it gets a real
 * download with progress. Pulling it through fetch would buffer an entire
 * stadium in the tab to do the same thing worse.
 */
export function AttendeeTable({
  eventId,
  tiers,
  currency = "BRL",
}: {
  eventId: string;
  tiers: Ticket[];
  currency?: string;
}) {
  const t = useTranslations("attendees");
  const tAudience = useTranslations("audience");
  const tReports = useTranslations("reports");
  const locale = useLocale() as Locale;

  const [rows, setRows] = React.useState<Attendee[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [ticketId, setTicketId] = React.useState("");
  const [status, setStatus] = React.useState("paid");
  // Offset paging that APPENDS, rather than a growing limit.
  //
  // A limit that keeps growing hits the server's per-request cap and then
  // silently stops returning more, which looks exactly like "that is all of
  // them" and is not. Fetching the next page and appending has no ceiling.
  const [offset, setOffset] = React.useState(0);

  // Debounced, because this fires on every keystroke of the search box and each
  // one is a query over the event's orders.
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // A filter change starts the list over. Without this, page two of the old
  // filter would be appended under page one of the new one.
  //
  // Adjusted DURING RENDER rather than in an effect, which is React's own
  // pattern for "reset state when an input changes": an effect would render
  // once with the stale rows, then again with them cleared, and the flash of
  // the previous filter's results is exactly what the reset is for. React
  // discards the first pass and re-runs immediately, so nothing is painted.
  const signature = `${eventId}|${debounced}|${ticketId}|${status}`;
  const [lastSignature, setLastSignature] = React.useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setOffset(0);
    setRows(null);
  }

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await listAttendees(eventId, {
        q: debounced || undefined,
        ticketId: ticketId || undefined,
        status,
        limit: PAGE_SIZE,
        offset,
      });
      if (cancelled) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setTotal(data.total);
      setRows((current) => (offset === 0 || current === null ? data.data : [...current, ...data.data]));
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, debounced, ticketId, status, offset]);

  const filtered = debounced !== "" || ticketId !== "" || status !== "paid";
  const exportFilters = {
    q: debounced || undefined,
    ticketId: ticketId || undefined,
    status,
  };

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {/* The export carries the SAME filters as the table, so what an
            organiser sees is what they download. An export that silently
            ignored the filter above it is a spreadsheet nobody can trust. */}
        <button
          type="button"
          onClick={() => void downloadAttendees(eventId, exportFilters)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover"
        >
          <DownloadSimple size={15} aria-hidden />
          {t("export")}
        </button>
      </header>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <ElevatedInput
          id="attendee-search"
          label={t("search")}
          icon={<MagnifyingGlass size={18} aria-hidden />}
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          type="search"
        />
        <Field id="attendee-tier" label={t("columns.tier")}>
          <SelectField
            id="attendee-tier"
            value={ticketId}
            onChange={(event) => setTicketId(event.target.value)}
            className="h-11"
          >
            <option value="">{t("allTiers")}</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.title}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field id="attendee-status" label={t("columns.status")}>
          <SelectField
            id="attendee-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11"
          >
            <option value="paid">{t("status.paid")}</option>
            <option value="refunded">{t("status.refunded")}</option>
            <option value="all">{t("status.all")}</option>
          </SelectField>
        </Field>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("privacy")}</p>

      {failed ? (
        <p role="alert" className="notice notice-fault notice-ink px-3 py-2 text-sm">
          {t("loadFailed")}
        </p>
      ) : rows === null ? (
        <div className="h-40 animate-pulse rounded-lg bg-accent-hover" aria-hidden />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {filtered ? t("emptyFiltered") : t("empty")}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left">
                  {[
                    t("columns.name"),
                    t("columns.email"),
                    t("columns.document"),
                    t("columns.gender"),
                    t("columns.age"),
                    t("columns.city"),
                    t("columns.tier"),
                  ].map((heading) => (
                    <th key={heading} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground">
                      {heading}
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold text-muted-foreground">
                    {t("columns.quantity")}
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold text-muted-foreground">
                    {t("columns.net")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((attendee) => (
                  <tr
                    key={`${attendee.orderId}-${attendee.ticketId}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal text-foreground">
                      {attendee.name}
                      {attendee.status === "refunded" ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {t("status.labels.refunded")}
                        </span>
                      ) : null}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{attendee.email}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                      {attendee.documentMask || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {attendee.gender && attendee.gender !== "undisclosed"
                        ? tAudience(`genders.${attendee.gender}` as "genders.female")
                        : tReports("notInformed")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {attendee.ageYears ? attendee.ageYears : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {attendee.city ? `${attendee.city}${attendee.uf ? ` - ${attendee.uf}` : ""}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {attendee.ticketTitle}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {attendee.quantity}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatMoney(attendee.netCents, locale, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("showing", { shown: rows.length, total })}
            </p>
            {rows.length < total ? (
              <button
                type="button"
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover"
              >
                {t("loadMore")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
