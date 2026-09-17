"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { AttendeeTable } from "@/components/reports/attendee-table";
import { EventReport } from "@/components/reports/event-report";
import { RefundInbox } from "@/components/reports/refund-inbox";
import { ArrowLeft, ChartBar } from "@/components/icons";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { Link } from "@/i18n/routing";
import { getOwnEvent } from "@/lib/events/admin-api";
import { listTickets } from "@/lib/tickets/api";
import type { EventSummary } from "@/lib/events/types";
import type { Ticket } from "@/lib/tickets/types";

/**
 * Everything an organiser knows about one event's audience, on one screen.
 *
 * Three blocks in the order they are actually read: the numbers first, because
 * that is the question somebody opens this page with; then the refund queue,
 * because it is the only part that needs an action; then the list of people,
 * which is long and is usually reached by way of the export button on it.
 */
export function EventInsights({ eventId }: { eventId: string }) {
  const t = useTranslations("reports");
  const tManager = useTranslations("eventManager");

  const [event, setEvent] = React.useState<EventSummary | null>(null);
  const [tiers, setTiers] = React.useState<Ticket[]>([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Both at once: the tiers do not depend on the event, and stacking the
      // two latencies would leave the page blank for twice as long.
      const [found, page] = await Promise.all([
        getOwnEvent(eventId),
        listTickets({ eventId, limit: 100, sort: "price" }),
      ]);
      if (cancelled) return;
      if (found.error || !found.data) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setEvent(found.data);
      setTiers(page.data?.data ?? []);
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

  return (
    <div className="flex flex-col gap-6">
      <DashboardPageHeader
        icon={<ChartBar weight="regular" />}
        title={event?.name ?? t("title")}
        description={t("subtitle")}
        actions={
          <Link
            href={`/events/${eventId}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover"
          >
            <ArrowLeft size={15} aria-hidden />
            {tManager("backToEvents")}
          </Link>
        }
      />

      <EventReport eventId={eventId} />
      <RefundInbox eventId={eventId} />
      <AttendeeTable eventId={eventId} tiers={tiers} />
    </div>
  );
}
