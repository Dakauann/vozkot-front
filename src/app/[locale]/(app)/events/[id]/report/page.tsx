import { EventInsights } from "@/components/reports/event-insights";

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  // Read in the browser with the session's own cookies, like the editor beside
  // it: this route is behind the auth gate and the API authorises the visitor
  // against the event's owner, not the server rendering for them.
  const { id } = await params;

  return <EventInsights eventId={id} />;
}
