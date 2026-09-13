"use client";

import * as React from "react";

import { ArrowLeft, CircleNotch, Warning } from "@/components/icons";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import type { Ticket } from "@/lib/tickets/types";
import { TicketForm } from "@/components/tickets/ticket-form";
import { getTicket } from "@/lib/tickets/api";
import { useTranslations } from "next-intl";

/**
 * Loads the record the edit route names, then hands it to the same form the
 * creation route uses.
 *
 * The fetch happens in the browser because the API authenticates the visitor
 * through their own httpOnly cookies; a server render here would have to
 * forward credentials it was never given.
 */
export function TicketEditor({ ticketId }: { ticketId: string }) {
  const t = useTranslations("tickets.form");
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "missing">("loading");

  React.useEffect(() => {
    let active = true;

    async function run() {
      const result = await getTicket(ticketId);
      if (!active) return;
      if (result.data) {
        setTicket(result.data);
        setState("ready");
        return;
      }
      setState("missing");
    }

    void run();
    return () => {
      active = false;
    };
  }, [ticketId]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </div>
    );
  }

  if (state === "missing" || !ticket) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
          <Warning size={20} />
        </span>
        <p className="mt-3 text-sm font-semibold">{t("notFound")}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard">
            <ArrowLeft size={15} />
            {t("backToTickets")}
          </Link>
        </Button>
      </div>
    );
  }

  return <TicketForm ticket={ticket} />;
}
