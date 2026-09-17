"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Check, CheckCircle, CircleNotch, Copy, Prohibit } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatLongDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  listTickets,
  ticketQRSource,
  type Admission,
} from "@/lib/admissions/api";

/**
 * The buyer's tickets, as they will actually be used.
 *
 * The use scene decides everything here. Somebody is standing in a queue with
 * one hand on their phone, the other holding a drink or a friend, and a
 * doorperson leaning in with a scanner. Three consequences:
 *
 *  - The QR sits on WHITE, in both themes. A ticket rendered on a dark card is
 *    a ticket that takes three attempts to read: phone cameras meter for the
 *    bright surroundings and a dark-on-darker symbol loses its edges. This is
 *    the one place in the app that ignores the theme, and it does so because
 *    the scanner is the user here, not the reader.
 *  - The printed code is directly beneath its own QR, not collected at the
 *    bottom. When the camera fails, the doorperson types the code for THIS
 *    ticket, and a list of four codes under four symbols is the layout that
 *    gets the wrong one typed.
 *  - A spent ticket is unmistakable before anybody reaches the door. It is
 *    struck through, greyed, and the QR is dimmed behind its verdict, because
 *    presenting a used ticket is a queue's worth of wasted time.
 *
 * Monospace on the code is not a costume. The code is a string that gets read
 * character by character and typed into a box; a proportional face makes 0 and
 * O and 1 and l the reader's problem, and the alphabet already went to the
 * trouble of excluding them.
 */

export interface TicketWalletProps {
  orderId: string;
  /** Rendered only for a paid order; the caller decides that. */
  className?: string;
}

export function TicketWallet({ orderId, className }: TicketWalletProps) {
  const t = useTranslations("myTickets");
  const locale = useLocale() as Locale;

  const [tickets, setTickets] = React.useState<Admission[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    listTickets(orderId).then((result) => {
      if (!live) return;
      if (result.data) {
        setTickets(result.data.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [orderId]);

  if (failed) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)} role="status">
        {t("unavailable")}
      </p>
    );
  }

  if (tickets === null) {
    return (
      <p
        className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
        role="status"
      >
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  if (tickets.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>{t("none")}</p>
    );
  }

  return (
    <section className={cn("space-y-3", className)} aria-label={t("heading")}>
      <header className="space-y-1">
        <h3 className="font-display text-base font-semibold tracking-[-0.01em]">
          {t("heading")}
        </h3>
        <p className="max-w-[54ch] text-sm leading-6 text-muted-foreground">
          {tickets.length > 1 ? t("introMany") : t("introOne")}
        </p>
      </header>

      <ul className="space-y-3">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <TicketCard ticket={ticket} orderId={orderId} total={tickets.length} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TicketCard({
  ticket,
  orderId,
  total,
  locale,
}: {
  ticket: Admission;
  orderId: string;
  total: number;
  locale: Locale;
}) {
  const t = useTranslations("myTickets");
  const spent = ticket.status !== "issued";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[--radius] border border-border bg-card",
        spent && "opacity-90",
      )}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-sm font-semibold text-foreground",
              spent && "line-through decoration-2",
            )}
          >
            {ticket.ticketTitle}
          </p>
          {/* The chair, when there is one, in place of "single admission":
              a buyer holding a reserved ticket needs the seat far more than
              they need to be told the ticket admits one person. */}
          {ticket.seat ? (
            <p
              className={cn(
                "mt-0.5 text-xs font-semibold text-foreground",
                spent && "line-through",
              )}
            >
              {ticket.seat.label}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {total > 1
              ? t("sequence", { index: ticket.sequence, total })
              : t("single")}
          </p>
        </div>
        <StatusBadge status={ticket.status} admittedAt={ticket.admittedAt} locale={locale} />
      </div>

      <div className="flex flex-col items-center gap-4 px-4 py-5 sm:flex-row sm:items-center sm:gap-6">
        <QRPanel ticket={ticket} orderId={orderId} spent={spent} />
        <CodePanel ticket={ticket} spent={spent} />
      </div>
    </article>
  );
}

/**
 * The symbol itself.
 *
 * Fixed white plate with a real quiet zone, sized so the modules land on whole
 * pixels. `image-rendering: pixelated` is deliberate: the PNG is 256px and is
 * displayed larger, and a smoothed upscale softens exactly the module edges a
 * camera is looking for.
 */
function QRPanel({
  ticket,
  orderId,
  spent,
}: {
  ticket: Admission;
  orderId: string;
  spent: boolean;
}) {
  const t = useTranslations("myTickets");

  return (
    <div className="relative shrink-0">
      <div className="rounded-[--radius] bg-white p-3 shadow-[0_1px_2px_rgba(20,23,26,0.08),0_8px_24px_-12px_rgba(20,23,26,0.25)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a per-session
            private image from the API, not a static asset: next/image would
            proxy and cache a bearer credential. */}
        <img
          src={ticketQRSource(orderId, ticket.id)}
          alt={t("qrAlt", { code: ticket.code })}
          width={168}
          height={168}
          className={cn(
            "block size-[168px] [image-rendering:pixelated]",
            spent && "opacity-25",
          )}
        />
      </div>
      {spent ? (
        <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-[0_1px_2px_rgba(20,23,26,0.12)]">
            {ticket.status === "void" ? t("badge.void") : t("badge.used")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function CodePanel({ ticket, spent }: { ticket: Admission; spent: boolean }) {
  const t = useTranslations("myTickets");
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticket.qrPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard the browser refuses is not worth an error dialog: the code
      // is on screen and can be read out.
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div className="min-w-0 flex-1 text-center sm:text-left">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {t("codeLabel")}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-[1.375rem] font-bold leading-tight tracking-[0.08em] text-foreground",
          spent && "text-muted-foreground line-through decoration-2",
        )}
      >
        {ticket.code}
      </p>
      <p className="mt-2 max-w-[38ch] text-xs leading-5 text-muted-foreground">
        {t("codeHint")}
      </p>
      {!spent ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          className="mt-3 gap-1.5"
        >
          {copied ? (
            <Check className="size-3.5 text-primary-ink" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          {copied ? t("copied") : t("copy")}
        </Button>
      ) : null}
    </div>
  );
}

function StatusBadge({
  status,
  admittedAt,
  locale,
}: {
  status: Admission["status"];
  admittedAt?: string;
  locale: Locale;
}) {
  const t = useTranslations("myTickets");

  if (status === "issued") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary-ink">
        {t("badge.valid")}
      </span>
    );
  }
  if (status === "void") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        <Prohibit className="size-3.5" aria-hidden="true" />
        {t("badge.void")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
      title={admittedAt ? formatLongDateTime(admittedAt, locale) : undefined}
    >
      <CheckCircle className="size-3.5" aria-hidden="true" />
      {t("badge.used")}
    </span>
  );
}
