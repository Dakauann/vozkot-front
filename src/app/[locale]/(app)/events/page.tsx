import { setRequestLocale } from "next-intl/server";

import { EventWorkspace } from "@/components/events/event-workspace";

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <EventWorkspace />;
}
