import { EventEditor } from "@/components/events/event-editor";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  // The record is read in the browser, with the session's own cookies: this
  // route is behind the auth gate and the API authenticates the visitor, not
  // the server rendering for them.
  const { id } = await params;

  return <EventEditor eventId={id} />;
}
