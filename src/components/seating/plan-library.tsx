"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { CaretDown, Check, CircleNotch, Plus, Warning } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { RoomPreview } from "@/components/seating/room-preview";
import {
  createLayout,
  createVenue,
  fetchLayout,
  listLayouts,
  listVenues,
  markersOf,
  type Layout,
  type LayoutDetail,
  type Venue,
} from "@/lib/seating/api";

/**
 * The plans an organiser has, as folders.
 *
 * This page used to BE the builder, which meant opening "Plantas" dropped you
 * onto a full-bleed canvas that then asked, in two `sr-only`-labelled
 * dropdowns, which venue and which plan you meant. The first replacement was a
 * library, and it was still hard to read: a column of venues beside a separate
 * column of plans asks you to hold the relationship between them in your head.
 *
 * A venue CONTAINS its plans, so it is drawn containing them. One tree, one
 * column, each venue opening to show what is inside — and each plan carrying
 * its size, because telling two plans apart is the whole reason to come here
 * and a list of names and version numbers cannot do it.
 */
export function PlanLibrary() {
  const t = useTranslations("layoutStudio");

  const [venues, setVenues] = React.useState<Venue[] | null>(null);
  /** Plans per venue, fetched when a folder is first opened. */
  const [plans, setPlans] = React.useState<Record<string, Layout[]>>({});
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState<Record<string, boolean>>({});
  const [planId, setPlanId] = React.useState("");
  const [preview, setPreview] = React.useState<{ id: string; detail: LayoutDetail } | null>(null);
  const [busy, setBusy] = React.useState(false);

  /**
   * Fetch what is inside a folder, once.
   *
   * Plain function rather than an effect watching `open`: opening a folder is
   * something somebody DID, and the fetch belongs where the decision is, not in
   * a reaction that has to work out which folders it has not seen yet.
   */
  const loadPlans = React.useCallback((venueId: string) => {
    setLoading((current) => ({ ...current, [venueId]: true }));
    listLayouts(venueId).then((result) => {
      setPlans((current) => ({ ...current, [venueId]: result.data?.data ?? [] }));
      setLoading((current) => ({ ...current, [venueId]: false }));
    });
  }, []);

  React.useEffect(() => {
    let live = true;
    listVenues().then((result) => {
      if (!live) return;
      const found = result.data?.data ?? [];
      setVenues(found);
      // The first folder opens itself. An organiser with one venue should not
      // have to click it before seeing anything, and one with six gets a
      // readable list rather than everything at once.
      if (found.length > 0) {
        setOpen({ [found[0].id]: true });
        loadPlans(found[0].id);
      }
    });
    return () => {
      live = false;
    };
  }, [loadPlans]);

  /** Open or close a folder, fetching what is inside the first time. */
  const toggle = (venueId: string) => {
    setOpen((current) => ({ ...current, [venueId]: !current[venueId] }));
    if (plans[venueId] === undefined) loadPlans(venueId);
  };

  React.useEffect(() => {
    if (!planId) return;
    let live = true;
    fetchLayout(planId).then((detail) => {
      if (!live || !detail) return;
      setPreview({ id: planId, detail });
    });
    return () => {
      live = false;
    };
  }, [planId]);

  const shown = preview?.id === planId ? preview.detail : null;

  const addVenue = async () => {
    const name = window.prompt(t("venue.prompt"))?.trim();
    if (!name) return;
    setBusy(true);
    const result = await createVenue(name);
    setBusy(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("failed"));
      return;
    }
    const venue = result.data.data;
    setVenues((list) => [...(list ?? []), venue]);
    setPlans((current) => ({ ...current, [venue.id]: [] }));
    setOpen((current) => ({ ...current, [venue.id]: true }));
  };

  const addPlan = async (venueId: string) => {
    const name = window.prompt(t("layout.prompt"))?.trim();
    if (!name) return;
    setBusy(true);
    const result = await createLayout(venueId, { name });
    setBusy(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("failed"));
      return;
    }
    const created = result.data.data;
    setPlans((current) => ({ ...current, [venueId]: [...(current[venueId] ?? []), created] }));
    setPlanId(created.id);
  };

  if (venues === null) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {t("library.title")}
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
            {t("library.hint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void addVenue()}
          disabled={busy}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t("venue.add")}
        </Button>
      </header>

      {venues.length === 0 ? (
        <section className="rounded-[--radius] border border-border bg-card px-5 py-8 text-center">
          <h2 className="font-display text-base font-semibold text-foreground">
            {t("library.firstVenue")}
          </h2>
          <p className="mx-auto mt-1 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            {t("library.firstVenueHint")}
          </p>
          <Button type="button" onClick={() => void addVenue()} disabled={busy} className="mt-4">
            <Plus className="size-3.5" aria-hidden="true" />
            {t("venue.add")}
          </Button>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* One tree, one column. A venue contains its plans, so it is drawn
              containing them rather than beside them. */}
          <nav aria-label={t("library.title")} className="min-w-0">
            <ul className="space-y-1">
              {venues.map((venue) => {
                const inside = plans[venue.id];
                const expanded = open[venue.id] === true;
                return (
                  <li key={venue.id}>
                    <h2>
                      <button
                        type="button"
                        onClick={() => toggle(venue.id)}
                        aria-expanded={expanded}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[--radius] px-2 py-2 text-left",
                          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <CaretDown
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition-transform",
                            !expanded && "-rotate-90",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {venue.name}
                        </span>
                        <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">
                          {inside === undefined
                            ? ""
                            : t("library.planCount", { count: inside.length })}
                        </span>
                      </button>
                    </h2>

                    {expanded ? (
                      // Indented under the venue, with a hairline down the
                      // left so the containment is visible at a glance rather
                      // than inferred from the indent.
                      <div className="ml-[1.4375rem] border-l border-border pl-2">
                        {loading[venue.id] ? (
                          <p className="py-2 pl-1 text-xs text-muted-foreground" role="status">
                            {t("loading")}
                          </p>
                        ) : (inside ?? []).length === 0 ? (
                          <p className="max-w-[34ch] py-2 pl-1 text-xs leading-5 text-muted-foreground">
                            {t("library.noPlans")}
                          </p>
                        ) : (
                          <ul className="space-y-0.5 py-1">
                            {(inside ?? []).map((plan) => (
                              <li key={plan.id}>
                                {/* Selection is SOLID, the same grammar as the
                                    sidebar and the primary button. The tint
                                    this replaced sat at 94% lightness against
                                    a 93% hover grey, so the chosen plan read
                                    no stronger than whichever one the pointer
                                    happened to be over. */}
                                <button
                                  type="button"
                                  onClick={() => setPlanId(plan.id)}
                                  aria-current={plan.id === planId ? "true" : undefined}
                                  className={cn(
                                    "w-full rounded-[--radius] px-2 py-1.5 text-left transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    plan.id === planId
                                      ? "bg-primary text-primary-foreground shadow-button-primary hover:bg-[hsl(var(--primary-hover))]"
                                      : "hover:bg-muted",
                                  )}
                                >
                                  <span className="flex items-baseline justify-between gap-2">
                                    <span
                                      className={cn(
                                        "truncate text-sm",
                                        plan.id === planId ? "font-medium" : "text-foreground",
                                      )}
                                    >
                                      {plan.name}
                                    </span>
                                    <span
                                      className={cn(
                                        "shrink-0 text-[0.6875rem] tabular-nums",
                                        plan.id === planId ? "opacity-80" : "text-muted-foreground",
                                      )}
                                    >
                                      {t("library.seatsShort", { seats: plan.seatCount ?? 0 })}
                                    </span>
                                  </span>
                                  <span
                                    className={cn(
                                      "mt-0.5 flex items-center gap-1 text-[0.6875rem]",
                                      plan.id === planId ? "opacity-80" : "text-muted-foreground",
                                    )}
                                  >
                                    {plan.status === "published" ? (
                                      <Check
                                        className={cn(
                                          "size-3 shrink-0",
                                          plan.id === planId ? "" : "text-healthy-ink",
                                        )}
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                    v{plan.version} · {t(`state.${plan.status}`)}
                                    {plan.frozen ? ` · ${t("library.frozen")}` : null}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void addPlan(venue.id)}
                          disabled={busy}
                          className="mb-1 ml-1"
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          {t("layout.add")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* The room itself. This is the whole reason the page exists: picking
              the right plan out of a list of names is guessing, and the bind
              that follows cannot be undone. */}
          <section aria-live="polite" className="min-w-0">
            {shown ? (
              <PlanCard detail={shown} />
            ) : (
              <p className="rounded-[--radius] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                {planId === "" ? t("library.pick") : t("loading")}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** One plan, drawn, with what it holds and the way into the builder. */
function PlanCard({ detail }: { detail: LayoutDetail }) {
  const t = useTranslations("layoutStudio");
  const { layout, sections, seats } = detail;

  const sellable = sections.filter(
    (section) =>
      section.kind === "seated" || section.kind === "standing" || section.kind === "booth",
  );
  const standing = sections
    .filter((section) => section.kind === "standing" || section.kind === "booth")
    .reduce((total, section) => total + section.capacity, 0);
  // The price bands, from the seats whose band the server already resolved.
  const bands = new Set(seats.map((seat) => seat.category).filter(Boolean));

  return (
    <div className="rounded-[--radius] border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground">{layout.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            v{layout.version} · {t(`state.${layout.status}`)}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/venues/${layout.id}`}>{t("library.manage")}</Link>
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label={t("library.seats")} value={seats.length} />
        <Stat label={t("library.sectors")} value={sellable.length} />
        <Stat label={t("library.bands")} value={bands.size} />
        <Stat label={t("library.standing")} value={standing} />
      </dl>

      {layout.frozen ? (
        <p className="notice notice-warning mt-4 flex items-start gap-1.5 px-3 py-2 text-xs leading-5">
          <Warning className="notice-ink mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="notice-ink">{t("layout.frozenExplained")}</span>
        </p>
      ) : null}

      {seats.length === 0 && sections.length === 0 ? (
        <p className="mt-4 max-w-[52ch] text-sm leading-6 text-muted-foreground">
          {t("library.emptyPlan")}
        </p>
      ) : (
        <RoomPreview
          seats={seats}
          markers={markersOf(sections)}
          names={Object.fromEntries(sections.map((section) => [section.id, section.name]))}
          className="mt-4 min-h-[320px] w-full"
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
