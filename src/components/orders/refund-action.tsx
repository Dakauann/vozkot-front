"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ArrowCounterClockwise, CircleNotch } from "@/components/icons";
import { Field, TextAreaField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { formatLongDateTime, formatMoney } from "@/lib/format";
import {
  getRefundEligibility,
  requestRefund,
  type RefundEligibility,
  type RefundRefusal,
} from "@/lib/refunds/api";
import type { Order } from "@/lib/checkout/api";

/**
 * "Cancelar e receber reembolso", on the buyer's own order.
 *
 * Nothing here decides whether a refund is allowed. The server owns that — one
 * pure function behind /refund-eligibility that the request endpoint also
 * calls — so this component asks and renders the answer. A window computed in
 * the browser would be a second implementation of a legal deadline, and the two
 * would disagree on exactly the days that matter.
 *
 * The eligibility is fetched LAZILY, when the buyer opens the row's actions,
 * rather than for every row of the list: it costs a query per order and most
 * rows are never acted on. The listing already carries enough to show a request
 * that is in flight, which is the only state a row has to render unprompted.
 */
export function RefundAction({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const t = useTranslations("orders.refund");
  const locale = useLocale() as Locale;

  const [eligibility, setEligibility] = React.useState<RefundEligibility | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // A request already in flight, known from the listing without another call.
  const inFlight = order.refund?.status;

  // Only a paid order can be refunded. An unpaid one is CANCELLED, which is a
  // different action with a different button, already on the row.
  const refundable = order.status === "paid" || order.status === "refund_required";
  if (!refundable) return null;

  if (inFlight) {
    return (
      <p className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground">
        {inFlight === "pending"
          ? t("statusPending")
          : inFlight === "approved"
            ? t("statusApproved")
            : t("statusRejected")}
      </p>
    );
  }

  const load = async () => {
    setLoading(true);
    const { data } = await getRefundEligibility(order.id);
    setLoading(false);
    setEligibility(data ?? null);
    setOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    const { data, error } = await requestRefund(order.id, { note: note.trim() || undefined });
    setSubmitting(false);
    if (error || !data) {
      toast.error(error?.message ?? t("failed"));
      return;
    }
    // The server says which of the two happened, so the message is the truth
    // rather than a guess: inside the statutory window the refund is already
    // approved and queued, outside it a person still has to look at it.
    toast.success(data.data.status === "approved" ? t("approved") : t("pending"));
    setOpen(false);
    onChanged();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? (
          <CircleNotch size={15} aria-hidden className="animate-spin" />
        ) : (
          <ArrowCounterClockwise size={15} aria-hidden />
        )}
        {t("action")}
      </button>
    );
  }

  // Refused: say why and by when, rather than showing a dead button. A disabled
  // control with no explanation is the most common way a self-service flow
  // turns into a support ticket.
  if (eligibility && !eligibility.allowed) {
    return (
      <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground sm:max-w-xs">
        <p>{refusalMessage(t, eligibility.refusal)}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-2 text-xs font-medium text-foreground underline"
        >
          {t("cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-card p-3 sm:max-w-sm">
      <p className="text-sm font-semibold text-card-foreground">{t("title")}</p>

      {eligibility ? (
        <>
          {/* amountCents is what the BUYER gets back, and is absent when the
              caller is not entitled to it. Rendered only when present rather
              than falling back to the organiser's share, because quoting a
              smaller number to a buyer would be worse than quoting none. */}
          {eligibility.amountCents !== undefined ? (
            <p className="mt-1 text-sm text-foreground">
              {t("amount", {
                amount: formatMoney(eligibility.amountCents, locale, order.currency),
              })}
            </p>
          ) : null}
          {/* The sentence that prevents the dispute: the service fee comes back
              too, which is what Procon-SP and the STJ require and what most
              platforms get wrong. */}
          {eligibility.refundsFees && (eligibility.feeCents ?? 0) > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{t("feeIncluded")}</p>
          ) : null}
          {eligibility.until ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("until", { date: formatLongDateTime(eligibility.until, locale) })}
            </p>
          ) : null}
        </>
      ) : null}

      <Field id={`refund-note-${order.id}`} label={t("noteLabel")} className="mt-3">
        <TextAreaField
          id={`refund-note-${order.id}`}
          rows={2}
          value={note}
          maxLength={1000}
          placeholder={t("notePlaceholder")}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {submitting ? t("submitting") : t("confirm")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

/**
 * The sentence for each refusal.
 *
 * Keyed on the server's stable code rather than on its message, which is
 * written for a person and arrives in one language.
 */
function refusalMessage(
  t: ReturnType<typeof useTranslations<"orders.refund">>,
  refusal: RefundRefusal | undefined,
): string {
  switch (refusal) {
    case "window_closed":
    case "too_close_to_event":
    case "not_paid":
    case "already_refunded":
    case "event_passed":
    case "request_open":
      return t(`refusals.${refusal}`);
    default:
      return t("failed");
  }
}
