import { Suspense } from "react";
import { TicketWorkspace } from "@/components/tickets/ticket-workspace";
import { setRequestLocale } from "next-intl/server";

export default async function TicketsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The workspace reads ?ticket= to preselect a record, and useSearchParams
  // needs a boundary for this route to stay statically rendered.
  return (
    <Suspense>
      <TicketWorkspace />
    </Suspense>
  );
}
