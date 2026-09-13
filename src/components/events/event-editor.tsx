"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { EventForm } from "@/components/events/event-form";
import { ArrowLeft, CircleNotch, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { getOwnEvent } from "@/lib/events/admin-api";
import type { EventSummary } from "@/lib/events/types";

/**
 * Loads the event the edit route names, then hands it to the same form the
 * creation route uses.
 *
 * The fetch happens in the browser because the API authenticates the visitor
 * through their own httpOnly cookies; a server render here would have to
 * forward credentials it was never given.
 */
export function EventEditor({ eventId }: { eventId: string }) {
  const t = useTranslations("eventAdmin");
  const [event, setEvent] = React.useState<EventSummary | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "missing">("loading");

  React.useEffect(() => {
    let active = true;

    async function run() {
      const result = await getOwnEvent(eventId);
      // The component may have unmounted while the request was in flight, and
      // setting state on it then is a warning at best and a leak at worst.
      if (!active) return;
      if (result.data) {
        setEvent(result.data);
        setState("ready");
        return;
      }
      setState("missing");
    }

    void run();
    return () => {
      active = false;
    };
  }, [eventId]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </div>
    );
  }

  if (state === "missing" || !event) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span
          className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <Warning size={20} />
        </span>
        <p className="mt-3 text-sm font-semibold">{t("notFound")}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/events">
            <ArrowLeft size={15} />
            {t("backToList")}
          </Link>
        </Button>
      </div>
    );
  }

  return <EventForm event={event} />;
}
