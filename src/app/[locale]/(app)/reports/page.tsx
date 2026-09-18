import { setRequestLocale } from "next-intl/server";

import { ReportPicker } from "@/components/reports/report-picker";

/**
 * The way in to one event's numbers.
 *
 * This route was a scaffold stub, so "Análises → Relatórios" led to a page
 * saying nothing was connected while the real per-event report sat at
 * /events/{id}/report, reachable only from the event itself. This is the
 * missing link rather than a second report: it picks the event and renders the
 * same component that page does.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReportPicker />;
}
