import { setRequestLocale } from "next-intl/server";

import { EventManager } from "@/components/events/event-manager";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <EventManager eventId={id} />;
}
