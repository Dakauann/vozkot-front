"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Check, CircleNotch, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, SelectField } from "@/components/ui/field";
import { Link, useRouter } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AreaTicketBindings } from "@/components/seating/area-ticket-bindings";
import { RoomPreview, toneAt, toneSwatch } from "@/components/seating/room-preview";
import {
  bindAreaTickets,
  bindSeating,
  createLayout,
  createVenue,
  fetchAvailability,
  fetchLayout,
  listLayouts,
  listVenues,
  markersOf,
  type Layout,
  type LayoutDetail,
  type Venue,
} from "@/lib/seating/api";
import type { Locale } from "@/i18n/config";
import type { EventSalesMode } from "@/lib/events/types";
import { updateTicket } from "@/lib/tickets/api";
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
  onBound,
  eventName,
  venueName,
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
  /**
   * Told to the page when this panel learns whether the night has seats.
   *
   * Whether a plan is bound lived only in here, so nothing else could draw the
   * setup chain an organiser is walking. Reported rather than fetched twice.
   */
  onBound?: (bound: boolean) => void;
  /** Names the plan after the night it is being drawn for. */
  eventName: string;
  /**
   * The venue as the organiser typed it into the event form.
   *
   * Used to name the venue record when they have none, which is the whole point
   * of asking here: they have already told us the building, and asking a second
   * time — in a `window.prompt`, on another screen — is the step that made this
   * feel like a different product.
   */
  venueName: string;
}) {
  const t = useTranslations("eventSeating");
  const locale = useLocale() as Locale;
  const router = useRouter();

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
  /** Section id -> lote, for the parts of the room sold by quantity. Keyed by
   *  id, never by name: a room may hold two boxes called "Camarote". */
  const [areaPricing, setAreaPricing] = React.useState<Record<string, string>>({});
  /** Lote id -> quantity this panel has just corrected, shown before a reload. */
  const [resized, setResized] = React.useState<Record<string, number>>({});
  const [fixing, setFixing] = React.useState("");
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
      onBound?.(seats > 0);
    });
    // Deliberately unguarded: an empty aggregate is a legitimate answer here
    // ("no seats bound"), so there is nothing to distinguish. The reads below,
    // where an empty answer changes what the organiser is TOLD, are guarded.
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Drafts included, because binding a plan publishes and freezes it in
      // the transaction that writes the seats. Offering published plans only
      // produced the worst dead end in the product: an organiser drew a room,
      // reached this screen, and was told the venue had no published plan —
      // about the plan they had just finished. Archived is the one exclusion
      // left, because that is somebody saying the room is retired.
      const sellable = (result.data?.data ?? []).filter(
        (layout) => layout.status !== "archived",
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
      // Every band starts pointed at the first tier, so the common case — one
      // room, one price — is already answered and the organiser only touches
      // what differs.
      const first = tiers[0]?.id ?? "";
      const seeded: Record<string, string> = {};
      for (const seat of found.seats) seeded[seat.category] = first;
      setPricing(seeded);
      // Areas start at "not sold", unlike bands. A band's lote only has to
      // exist; an area's has to FIT — its quantity is capped by the room — so
      // guessing one would seed a choice that fails on commit.
      setAreaPricing({});
    });
    return () => {
      live = false;
    };
  }, [layoutId, tiers, reload]);

  const layouts = loadedLayouts?.venueId === venueId ? loadedLayouts.list : [];
  const loadingLayouts = venueId !== "" && loadedLayouts?.venueId !== venueId;
  const detail = loaded?.id === layoutId ? loaded.detail : null;

  /**
   * The price bands this room has, and how many chairs are in each.
   *
   * Bands, not sections. A band is what the room sells by: it defaults to a
   * section's name, so an ordinary plateia is one band called "Plateia" and this
   * list looks exactly like the old one — but two wings sharing a band collapse
   * into ONE row, and the front three rows of a sector appear as their own.
   *
   * Taken from the seats, whose band the server has already resolved. Nothing
   * here repeats the fallback rule.
   */
  const bands = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const seat of detail?.seats ?? []) {
      counts.set(seat.category, (counts.get(seat.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, seats]) => ({ name, seats }))
      .sort((a, b) => b.seats - a.seats || a.name.localeCompare(b.name));
  }, [detail]);

  const priced = bands.filter((band) => pricing[band.name]);
  const unpriced = bands.filter((band) => !pricing[band.name]);
  /**
   * The standing floors and boxes of the plan.
   *
   * These hold people without giving anyone a numbered chair, so they produce
   * no seats and therefore no price band. Before this list existed they simply
   * vanished between the plan preview and the prices, and the only way to sell
   * one was to configure it after the seats had already gone on sale.
   */
  const areas = React.useMemo(
    () => (detail?.sections ?? []).filter((one) => one.kind === "standing" || one.kind === "booth"),
    [detail],
  );
  /**
   * Everything this room can sell tonight, in one list.
   *
   * Chairs and open areas were two separate lists, and the second one did not
   * exist before the seats were committed — so a plan with a pista and two
   * boxes showed the organiser five blocks on the drawing and one row to price,
   * with no way to tell whether the other four were forgotten or forbidden.
   * They are the same decision and they are asked once, in plan order.
   */
  const units = React.useMemo(() => {
    const rows = [
      ...bands.map((band) => ({
        kind: "band" as const,
        /** Bands are matched to chairs by NAME; that is the server's key too. */
        key: band.name,
        name: band.name,
        capacity: band.seats,
      })),
      ...areas.map((section) => ({
        kind: "area" as const,
        key: section.id,
        name: section.name,
        capacity: section.capacity,
      })),
    ];
    // The tone is positional, so the swatch on a row and the paint on the plan
    // are the same colour, and it is stable while the organiser works.
    return rows.map((row, index) => ({ ...row, tone: toneAt(index) }));
  }, [bands, areas]);

  const chosen = (unit: { kind: string; key: string }) =>
    (unit.kind === "band" ? pricing[unit.key] : areaPricing[unit.key]) ?? "";
  const choose = (unit: { kind: string; key: string }, ticketId: string) =>
    unit.kind === "band"
      ? setPricing((current) => ({ ...current, [unit.key]: ticketId }))
      : setAreaPricing((current) => ({ ...current, [unit.key]: ticketId }));
  /** The lote's size as it stands, including a correction made just now. */
  const sizeOf = (tier: Ticket) => resized[tier.id] ?? tier.quantity;
  /**
   * Why a chosen lote does not fit, or "" when it does.
   *
   * An area's lote is its stock, so the server requires it to fit inside the
   * room; chairs carry their own stock, so a short lote there only caps how
   * many of them can ever sell. One is refused, the other is worth saying.
   */
  const misfit = (unit: { kind: string; capacity: number }, tier?: Ticket) => {
    if (!tier) return "";
    if (unit.kind === "area") return sizeOf(tier) === unit.capacity ? "" : "blocks";
    return sizeOf(tier) < unit.capacity ? "caps" : "";
  };
  /** Paints the plan: bands by name, areas by section id, 0 for not sold. */
  const tones = Object.fromEntries(
    units.map((unit) => [unit.key, chosen(unit) ? unit.tone : 0]),
  );
  const conflicted = units.some((unit) =>
    misfit(unit, tiers.find((tier) => tier.id === chosen(unit))) === "blocks");

  /** Resize a lote to the place it is being sold in, in one press. */
  const resize = async (tier: Ticket, quantity: number) => {
    setFixing(tier.id);
    const result = await updateTicket(tier.id, {
      eventId, title: tier.title, description: tier.description,
      priceCents: tier.priceCents, quantity, status: tier.status,
    });
    setFixing("");
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setResized((current) => ({ ...current, [tier.id]: quantity }));
  };
  // Chairs in the bands actually being sold — not in the whole plan. The
  // organiser is about to commit these, and a total that counted a band they
  // left unpriced would be a number they could not check.
  const seatCount = priced.reduce((total, band) => total + band.seats, 0);

  /**
   * Draw a plan for THIS event, without leaving it first.
   *
   * Creates the venue from the address already on the event when there is none,
   * a draft plan named after the night, and hands the builder both — so the
   * canvas opens on a room to draw rather than on a question about which room.
   * `for` is what tells the builder to offer the way back.
   */
  const draw = async () => {
    setBusy(true);
    let venue = venues?.[0]?.id ?? "";
    if (venue === "") {
      const created = await createVenue(venueName.trim() || eventName);
      if (created.error || !created.data) {
        setBusy(false);
        toast.error(created.error?.message ?? t("failed"));
        return;
      }
      venue = created.data.data.id;
    }
    const plan = await createLayout(venue, { name: eventName });
    setBusy(false);
    if (plan.error || !plan.data) {
      toast.error(plan.error?.message ?? t("failed"));
      return;
    }
    router.push(`/venues/${plan.data.data.id}?for=${eventId}`);
  };

  const bind = async () => {
    if (!layoutId || priced.length === 0) return;
    setBusy(true);
    const ticketByCategory: Record<string, string> = {};
    for (const band of priced) ticketByCategory[band.name] = pricing[band.name];
    const result = await bindSeating(eventId, { layoutId, ticketByCategory });
    if (result.error || !result.data) {
      setBusy(false);
      toast.error(result.error?.message ?? t("failed"));
      return;
    }
    // The areas go second because they are written onto the manifest the call
    // above creates. Only this one is retryable: the chairs are now committed,
    // so a failure here must not read as "nothing happened" — it is an event
    // selling its chairs whose floor and boxes are not on sale yet, which the
    // section below fixes without touching the seats.
    const areaChoices = Object.fromEntries(
      Object.entries(areaPricing).filter(([sectionId, ticketId]) =>
        ticketId !== "" && areas.some((one) => one.id === sectionId)),
    );
    const areaResult = Object.keys(areaChoices).length > 0
      ? await bindAreaTickets(eventId, areaChoices)
      : null;
    setBusy(false);
    if (areaResult?.error) toast.error(t("areas.partial", { reason: areaResult.error.message }));
    else toast.success(t("bound", { seats: result.data.seatCount }));
    setBound({ seats: result.data.seatCount, sectors: priced.length });
    onBound?.(true);
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
        <AreaTicketBindings eventId={eventId} tiers={tiers} />
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
          className="notice notice-warning mt-1 flex max-w-[72ch] items-start gap-1.5 px-3 py-2 text-sm leading-6"
        >
          <Warning className="notice-ink mt-1 size-4 shrink-0" aria-hidden="true" />
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
        {/* Drawing one is the primary action, because the organiser has just
            said this event has numbered seats and the only thing standing
            between them and selling is a room. The library stays as the way to
            reuse a plan they already have. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void draw()} disabled={busy}>
            {t("draw")}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/venues">{t("goToStudio")}</Link>
          </Button>
        </div>
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
          tones={tones}
          className="min-h-[300px] w-full lg:sticky lg:top-20"
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

          {/* The join between geometry and money, in one place. The swatch is
              the whole point: it is the same colour this row's block is
              painted on the plan above, so "which of these is the left box"
              is answered by looking rather than by trusting two names to
              match. A lote's name links it to nothing; this choice does. */}
          {units.length > 0 ? (
            <div className="border-t border-border pt-3">
              <h3 className="legend">{t("pricing")}</h3>
              <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
                {t("pricingHint")}
              </p>
              <ul className="mt-3 space-y-3">
                {units.map((unit) => {
                  const picked = tiers.find((tier) => tier.id === chosen(unit));
                  const problem = misfit(unit, picked);
                  return (
                    <li key={`${unit.kind}-${unit.key}`} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-[0.5625rem] size-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
                          chosen(unit) ? toneSwatch(unit.tone) : "bg-muted",
                        )}
                      />
                      <div className="min-w-0 grow">
                        <Field
                          id={`unit-${unit.kind}-${unit.key}`}
                          label={unit.name}
                          hint={
                            unit.kind === "band"
                              ? t("bandSeats", { seats: unit.capacity })
                              : t("areas.capacity", { count: unit.capacity })
                          }
                        >
                          <SelectField
                            id={`unit-${unit.kind}-${unit.key}`}
                            value={chosen(unit)}
                            onChange={(event) => choose(unit, event.target.value)}
                          >
                            <option value="">{t("notSold")}</option>
                            {tiers.map((tier) => (
                              <option
                                key={tier.id}
                                value={tier.id}
                                // Only the one rule a buyer would feel: two
                                // places sharing a lote cannot be told apart in
                                // an order. Size is a fixable mismatch, said
                                // below in words rather than hidden here.
                                disabled={units.some(
                                  (other) =>
                                    other.key !== unit.key && chosen(other) === tier.id,
                                )}
                              >
                                {tier.title} · {formatMoney(tier.priceCents, locale, tier.currency)}
                              </option>
                            ))}
                          </SelectField>
                        </Field>
                        {problem && picked ? (
                          <p
                            className={cn(
                              "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5",
                              problem === "blocks" ? "text-warning-ink" : "text-muted-foreground",
                            )}
                          >
                            <Warning className="size-3.5 shrink-0" aria-hidden="true" />
                            {t(problem === "blocks" ? "sizeBlocks" : "sizeCaps", {
                              lote: picked.title,
                              has: sizeOf(picked),
                              needs: unit.capacity,
                              place: unit.name,
                            })}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={fixing !== "" || busy}
                              onClick={() => void resize(picked, unit.capacity)}
                            >
                              {fixing === picked.id
                                ? t("resizing")
                                : t("resize", { count: unit.capacity })}
                            </Button>
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
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
                <Button type="button" disabled={busy || priced.length === 0 || conflicted}>
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
                priced.length === 0 && !conflicted ? "text-muted-foreground" : "text-warning-ink",
              )}
            >
              <Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {conflicted
                ? t("conflict")
                : priced.length === 0
                  ? t("needsPricing")
                  : t("oneWayShort")}
            </p>
            {/* What is NOT being sold tonight, said before the click rather than
                discovered afterwards. A sector left unpriced is a sector that
                simply does not go on sale, which is a legitimate thing to want
                and a terrible thing to do by accident. */}
            {unpriced.length > 0 && priced.length > 0 ? (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {t("unpricedWarning", {
                  count: unpriced.length,
                  sectors: unpriced.map((band) => band.name).join(", "),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
