"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Check, CircleNotch, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, SelectField } from "@/components/ui/field";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { RoomPreview } from "@/components/seating/room-preview";
import {
  bindSeating,
  fetchAvailability,
  fetchLayout,
  listLayouts,
  listVenues,
  markersOf,
  type Layout,
  type LayoutDetail,
  type Venue,
} from "@/lib/seating/api";
import type { EventSalesMode } from "@/lib/events/types";
import type { Ticket } from "@/lib/tickets/types";

/**
 * Putting a drawn room on sale for one night.
 *
 * This was the missing link, and without it the whole feature was unreachable:
 * an organiser could draw a room in the studio and had no way to attach it to
 * an event, so no seat was ever sellable. A layout with no binding is a
 * drawing.
 *
 * Two decisions live here and nowhere else:
 *
 *  - WHICH ROOM. Only published layouts, because a draft is still being moved
 *    around and binding one would freeze it mid-thought.
 *  - WHAT EACH BLOCK COSTS. A section is priced by pointing it at a tier, which
 *    is the join between geometry and money. A block left unpriced is simply
 *    not sold — which is how an organiser closes the balcony for one night
 *    without editing the room.
 *
 * It is one-way on purpose. Once seats exist for a night they can be held, sold
 * and printed on somebody's ticket, so there is no "change the layout" button
 * here; the server refuses it and the copy says so instead of offering it.
 */
export function EventSeatingPanel({
  eventId,
  tiers,
  salesMode,
}: {
  eventId: string;
  tiers: Ticket[];
  /**
   * What the organiser said this event is when they created it.
   *
   * A `seated` event opens this panel already unfolded, because the organiser
   * has already answered the question the closed state asks. That is the entire
   * payoff of putting the question on the create form: the flow stops asking
   * twice, and stops guessing in between.
   */
  salesMode: EventSalesMode;
}) {
  const t = useTranslations("eventSeating");

  const [venues, setVenues] = React.useState<Venue[] | null>(null);
  const [venueId, setVenueId] = React.useState("");
  /**
   * The published plans of one venue, keyed to the venue they belong to.
   *
   * Keyed rather than replaced, so switching venues cannot leave the previous
   * venue's plans on screen for a frame — and so "these are still loading" is a
   * DERIVED fact rather than a second piece of state somebody has to keep in
   * step with the request.
   */
  const [loadedLayouts, setLoadedLayouts] = React.useState<{
    venueId: string;
    list: Layout[];
  } | null>(null);
  const [layoutId, setLayoutId] = React.useState("");
  // Keyed to the layout it describes, so switching never shows the previous
  // room for a frame and nothing has to be cleared synchronously in an effect.
  const [loaded, setLoaded] = React.useState<{ id: string; detail: LayoutDetail | null } | null>(
    null,
  );
  const [pricing, setPricing] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  // Whether this event has assigned seats at all. Closed until asked, because
  // most events do not, and the apparatus below is a lot of page to spend on a
  // feature somebody is not using.
  const [wanted, setWanted] = React.useState(salesMode === "seated");

  /**
   * Why a read failed, if one did.
   *
   * Every fetch here used to drop its error and fall through to an empty state,
   * which made a failure indistinguishable from an absence — and the absence
   * copy is confident: "you have not drawn a venue yet", with a button offering
   * to go and do the thing the organiser has already done. A failed read now
   * says so and offers to try again.
   */
  const [unreachable, setUnreachable] = React.useState(false);
  const retry = () => {
    setUnreachable(false);
    setReload((value) => value + 1);
  };
  const [reload, setReload] = React.useState(0);

  // Already on sale? Then this panel reports rather than offers.
  const [bound, setBound] = React.useState<{ seats: number; sectors: number } | null>(null);

  // Is this event already selling seats?
  //
  // Asked with the availability aggregate rather than by downloading the map.
  // The map is every row; this is a count per sector, and "does a map exist" is
  // a question that should not cost seven hundred rows on a page load.
  React.useEffect(() => {
    let live = true;
    fetchAvailability(eventId).then((sectors) => {
      if (!live) return;
      const seats = sectors.reduce((total, sector) => total + sector.total, 0);
      setBound(seats > 0 ? { seats, sectors: sectors.length } : null);
    });
    // Deliberately unguarded: an empty aggregate is a legitimate answer here
    // ("no seats bound"), so there is nothing to distinguish. The reads below,
    // where an empty answer changes what the organiser is TOLD, are guarded.
    return () => {
      live = false;
    };
  }, [eventId]);

  React.useEffect(() => {
    if (bound !== null || !wanted) return;
    let live = true;
    listVenues().then((result) => {
      if (!live) return;
      if (result.error) {
        setUnreachable(true);
        return;
      }
      const found = result.data?.data ?? [];
      setVenues(found);
      if (found.length > 0) setVenueId((current) => current || found[0].id);
    });
    return () => {
      live = false;
    };
  }, [bound, wanted, reload]);

  React.useEffect(() => {
    if (!venueId) return;
    let live = true;
    listLayouts(venueId).then((result) => {
      if (!live) return;
      if (result.error) {
        setUnreachable(true);
        return;
      }
      // Published only. A draft is still being moved around, and binding one
      // would freeze a room somebody is halfway through drawing.
      const sellable = (result.data?.data ?? []).filter(
        (layout) => layout.status === "published",
      );
      setLoadedLayouts({ venueId, list: sellable });
      setLayoutId(sellable[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [venueId, reload]);

  React.useEffect(() => {
    if (!layoutId) return;
    let live = true;
    fetchLayout(layoutId).then((found) => {
      if (!live) return;
      if (!found) {
        // `fetchLayout` returns null on failure, and storing that drew an empty
        // 300px room as if the plan itself were empty.
        setUnreachable(true);
        return;
      }
      setLoaded({ id: layoutId, detail: found });
      // Every seated block starts pointed at the first tier, so the common
      // case — one room, one price — is already answered and the organiser
      // only touches what differs.
      const first = tiers[0]?.id ?? "";
      const seeded: Record<string, string> = {};
      for (const section of found?.sections ?? []) {
        if (section.kind === "seated") seeded[section.id] = first;
      }
      setPricing(seeded);
    });
    return () => {
      live = false;
    };
  }, [layoutId, tiers, reload]);

  const layouts = loadedLayouts?.venueId === venueId ? loadedLayouts.list : [];
  const loadingLayouts = venueId !== "" && loadedLayouts?.venueId !== venueId;
  const detail = loaded?.id === layoutId ? loaded.detail : null;

  const seated = (detail?.sections ?? []).filter((section) => section.kind === "seated");
  const priced = seated.filter((section) => pricing[section.id]);
  const unpriced = seated.filter((section) => !pricing[section.id]);
  // Seats in the sectors that are actually being sold — not in the whole plan.
  // The organiser is about to commit these, and a total that counted a sector
  // they left unpriced would be a number they could not check.
  const pricedIds = new Set(priced.map((section) => section.id));
  const seatCount = (detail?.seats ?? []).filter((seat) => pricedIds.has(seat.sectionId)).length;

  const bind = async () => {
    if (!layoutId || priced.length === 0) return;
    setBusy(true);
    const ticketBySection: Record<string, string> = {};
    for (const section of priced) ticketBySection[section.id] = pricing[section.id];
    const result = await bindSeating(eventId, { layoutId, ticketBySection });
    setBusy(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("failed"));
      return;
    }
    toast.success(t("bound", { seats: result.data.seatCount }));
    setBound({ seats: result.data.seatCount, sectors: priced.length });
  };

  // --- already selling -------------------------------------------------------
  if (bound) {
    return (
      <section aria-labelledby="seating-heading" className="min-w-0">
        <h2 id="seating-heading" className="font-display text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm leading-6 text-muted-foreground">
          <Check className="mt-1 size-4 shrink-0 text-healthy-ink" aria-hidden="true" />
          {t("live", { seats: bound.seats, sectors: bound.sectors })}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("liveLocked")}</p>
      </section>
    );
  }

  // --- a read failed -------------------------------------------------------
  if (unreachable) {
    return (
      <section aria-labelledby="seating-heading" className="min-w-0">
        <h2 id="seating-heading" className="text-sm font-semibold text-foreground">
          {t("title")}
        </h2>
        <p
          role="status"
          className="mt-1 flex max-w-[72ch] items-start gap-1.5 text-sm leading-6 text-warning-ink"
        >
          <Warning className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {t("unreachable")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={retry} className="mt-3">
          {t("retry")}
        </Button>
      </section>
    );
  }

  // --- closed, which is how most events stay --------------------------------
  if (!wanted) {
    return (
      <section
        aria-labelledby="seating-heading"
        className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"
      >
        <div className="min-w-0">
          <h2
            id="seating-heading"
            className="text-sm font-semibold text-foreground"
          >
            {t("title")}
          </h2>
          <p className="max-w-[72ch] text-sm leading-6 text-muted-foreground">
            {tiers.length === 0 ? t("needsTier") : t("closed")}
          </p>
        </div>
        {tiers.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWanted(true)}
            className="shrink-0"
          >
            {t("open")}
          </Button>
        ) : null}
      </section>
    );
  }

  if (venues === null) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  // --- the plans of the chosen venue are still coming ------------------------
  if (loadingLayouts) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  // --- nothing to bind to ----------------------------------------------------
  //
  // Only once the plans have actually arrived. Reading an empty list as "this
  // venue has no published plan" while the request was still in flight is the
  // same mistake as reading a failed request that way: it states an absence it
  // has not established.
  if (venues.length === 0 || layouts.length === 0) {
    return (
      <section aria-labelledby="seating-heading" className="min-w-0">
        <h2 id="seating-heading" className="font-display text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-[60ch] text-sm leading-6 text-muted-foreground">
          {venues.length === 0 ? t("noVenue") : t("noPublished")}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/venues">{t("goToStudio")}</Link>
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="seating-heading" className="min-w-0">
      <h2 id="seating-heading" className="font-display text-lg font-semibold text-foreground">
        {t("title")}
      </h2>
      <p className="mt-1 max-w-[62ch] text-sm leading-6 text-muted-foreground">{t("hint")}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* The room, so an organiser can see they picked the right one before
            committing a night to it. */}
        <RoomPreview
          seats={detail?.seats ?? []}
          markers={markersOf(detail?.sections ?? [])}
          names={Object.fromEntries(
            (detail?.sections ?? []).map((section) => [section.id, section.name]),
          )}
          className="min-h-[300px] w-full"
        />

        <div className="space-y-3">
          <Field id="seating-venue" label={t("venue")}>
            <SelectField
              id="seating-venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </SelectField>
          </Field>

          <Field
            id="seating-layout"
            label={t("layout")}
            hint={loadingLayouts ? t("loading") : t("layoutHint")}
          >
            <SelectField
              id="seating-layout"
              value={layoutId}
              onChange={(event) => setLayoutId(event.target.value)}
              disabled={loadingLayouts}
            >
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name} · v{layout.version}
                </option>
              ))}
            </SelectField>
          </Field>

          {/* The join between geometry and money. One row per block, because
              the price is a per-block decision and an organiser with a plateia
              and a balcão charges differently for them. */}
          {seated.length > 0 ? (
            <div className="border-t border-border pt-3">
              <h3 className="legend">{t("pricing")}</h3>
              <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
                {t("pricingHint")}
              </p>
              <ul className="mt-2 space-y-2">
                {seated.map((section) => (
                  <li key={section.id}>
                    <Field id={`price-${section.id}`} label={section.name}>
                      <SelectField
                        id={`price-${section.id}`}
                        value={pricing[section.id] ?? ""}
                        onChange={(event) =>
                          setPricing((current) => ({
                            ...current,
                            [section.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">{t("notSold")}</option>
                        {tiers.map((tier) => (
                          <option key={tier.id} value={tier.id}>
                            {tier.title}
                          </option>
                        ))}
                      </SelectField>
                    </Field>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-t border-border pt-3">
            {/* Behind a confirmation, because this is the one thing in the
                product that cannot be taken back — and it was the only
                consequential action without one, while CANCELLING A TIER, which
                leaves existing orders valid, got a full destructive dialog.

                The dialog enumerates the commit rather than repeating the
                warning. "640 lugares em 4 setores" is checkable against the
                room on screen; "this cannot be undone" is not. */}
            <ConfirmDialog
              title={t("confirmTitle")}
              description={`${t("confirmBody", {
                seats: seatCount,
                sectors: priced.length,
                layout: layouts.find((one) => one.id === layoutId)?.name ?? "",
              })} ${t("oneWay")}`}
              confirmLabel={t("bind")}
              onConfirm={() => void bind()}
              trigger={
                <Button type="button" disabled={busy || priced.length === 0}>
                  {busy ? t("binding") : t("bind")}
                </Button>
              }
            />
            {/* The PERMANENT state is the emphatic one. This had it inverted:
                muted when everything was valid, and loud only when pricing was
                missing — so the recoverable problem shouted and the irreversible
                one whispered. */}
            <p
              className={cn(
                "mt-2 flex items-start gap-1.5 text-xs leading-5",
                priced.length === 0 ? "text-muted-foreground" : "text-warning-ink",
              )}
            >
              <Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {priced.length === 0 ? t("needsPricing") : t("oneWayShort")}
            </p>
            {/* What is NOT being sold tonight, said before the click rather than
                discovered afterwards. A sector left unpriced is a sector that
                simply does not go on sale, which is a legitimate thing to want
                and a terrible thing to do by accident. */}
            {unpriced.length > 0 && priced.length > 0 ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {t("unpricedWarning", {
                  count: unpriced.length,
                  sectors: unpriced.map((section) => section.name).join(", "),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
