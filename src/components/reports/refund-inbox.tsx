"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import type { Locale } from "@/i18n/config";
import { formatLongDateTime, formatMoney } from "@/lib/format";
import {
  approveRefund,
  listRefundRequests,
  rejectRefund,
  type RefundRequest,
} from "@/lib/refunds/api";

/**
 * The organiser's refund queue for one event.
 *
 * Two kinds of row sit here and the difference is the point:
 *
 *   - PENDING ones are decisions. A buyer asked outside the statutory window,
 *     or the organiser is being asked for a favour, and somebody has to answer.
 *   - AUTO-APPROVED ones are notifications. A withdrawal inside the seven days,
 *     or a cancelled event, is a refund nobody has standing to refuse, so it is
 *     already approved and shown here only so the organiser is not surprised by
 *     money leaving.
 *
 * Rendering the second kind with approve/decline buttons would offer a decision
 * that cannot go the other way, which is worse than offering none: it invites a
 * refusal that then has to be reversed.
 */
export function RefundInbox({ eventId, currency = "BRL" }: { eventId: string; currency?: string }) {
  const t = useTranslations("refunds");
  const locale = useLocale() as Locale;

  const [requests, setRequests] = React.useState<RefundRequest[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await listRefundRequests({ eventId, limit: 50 });
      if (cancelled) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setRequests(data.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  const decide = async (request: RefundRequest, approve: boolean) => {
    setBusy(request.id);
    const note = notes[request.id]?.trim() || undefined;
    const { error } = approve
      ? await approveRefund(request.id, note)
      : await rejectRefund(request.id, note);
    setBusy(null);
    if (error) {
      toast.error(error.message || t("decisionFailed"));
      return;
    }
    toast.success(approve ? t("approved") : t("rejected"));
    setReloadKey((current) => current + 1);
  };

  if (failed) {
    return (
      <p role="alert" className="notice notice-fault notice-ink px-3 py-2 text-sm">
        {t("loadFailed")}
      </p>
    );
  }
  if (requests === null) {
    return <div className="h-24 animate-pulse rounded-lg bg-accent-hover" aria-hidden />;
  }

  const pending = requests.filter((request) => request.status === "pending").length;

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="font-display text-lg font-semibold text-foreground">{t("inboxTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("inboxSubtitle")} · {t("pendingCount", { count: pending })}
        </p>
      </header>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground">
                    {t(`reasons.${request.reason}` as "reasons.buyer_withdrawal")}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {t("order")} {request.orderId}
                  </p>
                  {request.note ? (
                    <p className="mt-1 text-sm text-muted-foreground">“{request.note}”</p>
                  ) : null}
                  {/* An operator refund is OURS, not the organiser's: the
                      payment landed after the hold lapsed and the seats had
                      already been resold, so the platform owes the money and
                      never bills it to the organiser. Said here rather than
                      stored on the row, so it reads in the viewer's own
                      language. Without it this lands in the inbox looking like
                      a refund the organiser is paying for. */}
                  {request.reason === "operator" ? (
                    <p className="notice notice-info notice-ink mt-2 px-2 py-1 text-xs">
                      {t("operatorNote")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-card-foreground">
                    {/* The organiser's share, not the gross. The difference
                        between the two is our commission, and this table is
                        the organiser's. */}
                    {formatMoney(request.organiserCents, locale, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatLongDateTime(request.createdAt, locale)}
                  </p>
                </div>
              </div>

              {request.status === "pending" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={notes[request.id] ?? ""}
                    maxLength={1000}
                    placeholder={t("notePlaceholder")}
                    aria-label={t("noteLabel")}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    className="h-9 min-w-0 flex-1 rounded-md border border-control-edge bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15"
                  />
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => void decide(request, true)}
                    className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    {busy === request.id ? t("approving") : t("approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy === request.id}
                    onClick={() => void decide(request, false)}
                    className="inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy === request.id ? t("rejecting") : t("reject")}
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                    {t(`statuses.${request.status}` as "statuses.approved")}
                  </span>
                  {request.autoApproved ? (
                    <span className="text-muted-foreground" title={t("autoApprovedHint")}>
                      {t("autoApproved")}
                    </span>
                  ) : null}
                  {request.decisionNote ? (
                    <span className="text-muted-foreground">“{request.decisionNote}”</span>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
