import { TicketForm } from "@/components/tickets/ticket-form";
import { setRequestLocale } from "next-intl/server";

export default async function NewTicketPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <TicketForm ticket={null} />;
}
