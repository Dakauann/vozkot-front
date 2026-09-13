import { TicketForm } from "@/components/tickets/ticket-form";
import { setRequestLocale } from "next-intl/server";

export default async function NewTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { event } = await searchParams;

  // Arriving from an event's own page carries which night this tier is for, so
  // the organiser is not asked to pick it out of a list they just came from.
  const eventId = typeof event === "string" ? event : "";

  return <TicketForm ticket={null} eventId={eventId} />;
}
