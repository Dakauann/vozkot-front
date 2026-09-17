"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { bindAreaTickets, fetchSeatMap, type Marker } from "@/lib/seating/api";
import { updateTicket } from "@/lib/tickets/api";
import type { Ticket } from "@/lib/tickets/types";
import { Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { toneAt, toneSwatch } from "@/components/seating/room-preview";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Pricing the open parts of a room whose chairs are already on sale.
 *
 * The same decision the pre-sale panel asks, asked again here because it is the
 * only one that stays changeable: a box with no orders can still be repriced,
 * repointed or withdrawn long after the chairs are frozen.
 */
export function AreaTicketBindings({ eventId, tiers }: { eventId: string; tiers: Ticket[] }) {
  const t = useTranslations("eventSeating");
  const locale = useLocale() as Locale;
  const [areas, setAreas] = React.useState<Marker[] | null>(null);
  const [seated, setSeated] = React.useState<Set<string>>(new Set());
  const [bindings, setBindings] = React.useState<Record<string, string>>({});
  /** Lote id -> quantity corrected here, so a row stops warning immediately. */
  const [resized, setResized] = React.useState<Record<string, number>>({});
  const [fixing, setFixing] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    void fetchSeatMap(eventId).then((map) => {
      if (!live) return;
      if (!map?.complete) { setFailed(true); return; }
      const counted = (map.markers ?? []).filter((area) => area.kind === "standing" || area.kind === "booth");
      setAreas(counted);
      setSeated(new Set(map.seats.map((seat) => seat.ticketId)));
      setBindings(Object.fromEntries(counted.map((area) => [area.id, area.ticketId ?? ""])));
      setFailed(false);
    });
    return () => { live = false; };
  }, [eventId, attempt]);

  const sizeOf = (tier: Ticket) => resized[tier.id] ?? tier.quantity;
  /** An area's lote IS its stock, so the server requires it to fit the room. */
  const misfits = (area: Marker, tier?: Ticket) =>
    tier !== undefined && sizeOf(tier) !== (area.capacity ?? 0);
  const blocked = (areas ?? []).some((area) =>
    misfits(area, tiers.find((tier) => tier.id === bindings[area.id])));

  const resize = async (tier: Ticket, quantity: number) => {
    setFixing(tier.id);
    const result = await updateTicket(tier.id, {
      eventId, title: tier.title, description: tier.description,
      priceCents: tier.priceCents, quantity, status: tier.status,
    });
    setFixing("");
    if (result.error) { toast.error(result.error.message); return; }
    setResized((current) => ({ ...current, [tier.id]: quantity }));
  };

  const save = async () => {
    setBusy(true);
    const result = await bindAreaTickets(eventId, Object.fromEntries(Object.entries(bindings).filter(([, id]) => id)));
    setBusy(false);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success(t("areas.saved"));
  };

  if (failed) return <div role="alert" className="mt-4"><p>{t("failed")}</p><Button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("retry")}</Button></div>;
  if (!areas?.length) return null;

  return (
    <section className="mt-5 space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold">{t("areas.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("areas.hint")}</p>
      {areas.map((area, index) => {
        const picked = tiers.find((tier) => tier.id === bindings[area.id]);
        return (
          <div key={area.id} className="flex gap-3">
            {/* The same swatch the plan wears, so a list of similar names is
                still readable as a list of different places. */}
            <span aria-hidden="true"
              className={cn("mt-[0.5625rem] size-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
                bindings[area.id] ? toneSwatch(toneAt(index)) : "bg-muted")} />
            <div className="min-w-0 grow">
              <Field id={`area-ticket-${area.id}`} label={area.name}
                hint={t("areas.capacity", { count: area.capacity ?? 0 })}>
                <SelectField id={`area-ticket-${area.id}`} value={bindings[area.id] ?? ""} disabled={busy}
                  onChange={(event) => setBindings((current) => ({ ...current, [area.id]: event.target.value }))}>
                  <option value="">{t("notSold")}</option>
                  {tiers.filter((tier) => !seated.has(tier.id)).map((tier) => (
                    // Only the rule an order could not survive: two places on
                    // one lote. A size mismatch is said in words below and
                    // fixed in a press, because hiding it was the thing that
                    // made this screen impossible to get past.
                    <option key={tier.id} value={tier.id}
                      disabled={areas.some((other) => other.id !== area.id && bindings[other.id] === tier.id)}>
                      {tier.title} · {formatMoney(tier.priceCents, locale, tier.currency)}
                    </option>
                  ))}
                </SelectField>
              </Field>
              {picked && misfits(area, picked) ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-warning-ink">
                  <Warning className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("sizeBlocks", {
                    lote: picked.title, has: sizeOf(picked),
                    needs: area.capacity ?? 0, place: area.name,
                  })}
                  <Button type="button" variant="outline" size="sm" disabled={fixing !== "" || busy}
                    onClick={() => void resize(picked, area.capacity ?? 0)}>
                    {fixing === picked.id ? t("resizing") : t("resize", { count: area.capacity ?? 0 })}
                  </Button>
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
      {blocked ? <p className="text-xs leading-5 text-warning-ink">{t("conflict")}</p> : null}
      <Button type="button" disabled={busy || blocked} onClick={() => void save()}>{t("areas.save")}</Button>
    </section>
  );
}
