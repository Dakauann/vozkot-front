import { TicketEditor } from "@/components/tickets/ticket-editor";

export default async function EditTicketPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  // The record is read in the browser, with the session's own cookies: this
  // route is behind the auth gate and the API authenticates the visitor, not
  // the server rendering for them.
  const { id } = await params;

  return <TicketEditor ticketId={id} />;
}
