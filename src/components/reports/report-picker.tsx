"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { EventCombobox } from "@/components/events/event-combobox";
import { EventReport } from "@/components/reports/event-report";
import { Field } from "@/components/ui/field";
import { Link } from "@/i18n/routing";

/**
 * Pick an event, see its report.
 *
 * The combobox is the one the tier form already uses: searched and paged on the
 * SERVER, so an organiser with four hundred events gets a search box rather
 * than a four-hundred-row menu. Reused rather than rebuilt for exactly that
 * reason: the paging, the debounce and the abort are already right there.
 *
 * The report itself is the same component the event page renders. Choosing an
 * event here shows it inline; the link beside it goes to the fuller page, which
 * adds the refund queue and the attendee list.
 */
export function ReportPicker() {
  const t = useTranslations("reports");
  const [eventId, setEventId] = React.useState("");

  return (
    <main className="w-full">
      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {t("pickerTitle")}
      </h1>
      <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
        {t("pickerSubtitle")}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field id="report-event" label={t("pickerLabel")} className="min-w-0 flex-1 sm:max-w-sm">
          <EventCombobox id="report-event" value={eventId} onChange={setEventId} />
        </Field>
        {eventId ? (
          <Link
            href={`/events/${eventId}/report`}
            className="rounded-[--radius] text-sm font-medium text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("pickerFull")}
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        {eventId ? (
          <EventReport eventId={eventId} />
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {t("pickerEmpty")}
          </p>
        )}
      </div>
    </main>
  );
}
