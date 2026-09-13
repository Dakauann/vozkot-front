"use client";

import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { CircleNotch, PencilSimple, Plus, Prohibit, SealCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { Link } from "@/i18n/routing";
import { listOwnEvents, publishEvent, unpublishEvent } from "@/lib/events/admin-api";
import { DEFAULT_PAGE_SIZE, type EventListing, type EventStatus } from "@/lib/events/types";
import { formatDateTime } from "@/lib/format";

/**
 * The operator's event list.
 *
 * Unlike the public catalogue this shows drafts and cancelled events, which is
 * the whole reason it is a separate screen rather than the same one behind a
 * flag: the buyer-facing listing pins the status server-side and must keep
 * doing so.
 *
 * State lives in the component rather than the URL here, which is the opposite
 * of the catalogue's choice and deliberate. Nobody shares a link to page three
 * of their own draft list, and keeping it local means publishing an event does
 * not push a history entry an operator then has to click back through.
 */
export function EventWorkspace() {
  const t = useTranslations("eventAdmin");
  const common = useTranslations("common");
  const tManager = useTranslations("eventManager");
  const locale = useLocale() as Locale;

  const [events, setEvents] = React.useState<EventListing[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [status, setStatus] = React.useState<EventStatus | "">("");
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Resolved at render time so the effect below can depend on a string rather
  // than on the translator, whose identity is not guaranteed to be stable and
  // would re-run the fetch on every render.
  const loadError = t("errors.load");

  // The effect only reports what came back. Whatever asked for a new page —
  // the search box, the pagination buttons — turns the spinner on itself, so
  // nothing sets state synchronously while the effect body runs.
  React.useEffect(() => {
    let active = true;

    async function run() {
      const result = await listOwnEvents({
        q: query || undefined,
        limit: DEFAULT_PAGE_SIZE,
        offset,
      });
      // The operator may have navigated away, or typed a new search that has
      // already started its own request. Neither wants this answer.
      if (!active) return;

      setLoading(false);
      if (result.error || !result.data) {
        toast.error(result.error?.message ?? loadError);
        return;
      }
      setEvents(result.data.data);
      setTotal(result.data.total);
    }

    void run();
    return () => {
      active = false;
    };
  }, [offset, query, loadError]);

  // Filtering by status is done here rather than in the request because the
  // operator listing is small — one page of an organiser's own events — and a
  // round trip to hide three drafts is a round trip for nothing.
  const visible = status === "" ? events : events.filter((event) => event.status === status);

  async function toggle(event: EventListing) {
    setBusyId(event.id);
    const result =
      event.status === "published" ? await unpublishEvent(event.id) : await publishEvent(event.id);
    setBusyId(null);

    if (result.error || !result.data) {
      toast.error(result.error?.message ?? t("errors.save"));
      return;
    }
    const saved = result.data;
    setEvents((current) =>
      current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
    );
    toast.success(saved.status === "published" ? t("published") : t("unpublished"));
  }

  const pages = Math.ceil(total / DEFAULT_PAGE_SIZE);
  const page = Math.floor(offset / DEFAULT_PAGE_SIZE) + 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {t("listTitle")}
        </h1>
        <Button asChild size="sm">
          <Link href="/events/new">
            <Plus className="h-4 w-4" aria-hidden />
            {t("newEvent")}
          </Link>
        </Button>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          // A new search is a new result set, so the page number it was on no
          // longer means anything.
          setLoading(true);
          setOffset(0);
          setQuery(search.trim());
        }}
      >
        <label className="sr-only" htmlFor="event-search">
          {t("searchLabel")}
        </label>
        <TextField
          id="event-search"
          type="search"
          value={search}
          onChange={(changeEvent) => setSearch(changeEvent.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        <Button type="submit" size="sm" variant="secondary">
          {common("search")}
        </Button>

        <div className="flex flex-wrap gap-1.5">
          {(["", "draft", "published", "cancelled"] as const).map((value) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
              className={`h-7 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                status === value
                  ? "border-primary-edge bg-primary text-primary-foreground"
                  : "border-border-strong bg-background text-muted-foreground hover:bg-accent-hover"
              }`}
            >
              {value === "" ? t("filters.all") : t(`status.${value}`)}
            </button>
          ))}
        </div>
      </form>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
          {t("loading")}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-16 text-center">
          <p className="font-display text-sm font-semibold text-card-foreground">{t("empty")}</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-xs text-muted-foreground">
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                {/* Into the event's own page, not straight into the edit
                    form. Renaming a night is one of the things an organiser
                    does to it, and by far the rarest: the common work is
                    looking at what has sold and putting the next tier up. */}
                <Link
                  href={`/events/${event.id}`}
                  className="block truncate font-medium text-card-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {event.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatDateTime(event.startsAt, locale)} · {event.location.venue}
                  {event.location.city ? ` · ${event.location.city}` : ""}
                </p>
              </div>

              <StatusChip status={event.status} label={t(`status.${event.status}`)} />

              <p className="text-xs tabular-nums text-muted-foreground">
                {t("availableCount", { count: event.availableTickets })}
              </p>

              <Button asChild size="sm" variant="secondary">
                <Link href={`/events/${event.id}`}>{tManager("manage")}</Link>
              </Button>

              <Button
                type="button"
                size="sm"
                variant={event.status === "published" ? "outline" : "primary"}
                disabled={busyId === event.id || event.status === "cancelled"}
                onClick={() => void toggle(event)}
              >
                {busyId === event.id ? (
                  <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                {event.status === "published" ? t("unpublish") : t("publish")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={offset === 0}
            onClick={() => {
              setLoading(true);
              setOffset(Math.max(offset - DEFAULT_PAGE_SIZE, 0));
            }}
          >
            {t("previous")}
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {page} {common("of")} {pages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => {
              setLoading(true);
              setOffset(offset + DEFAULT_PAGE_SIZE);
            }}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Publication state, the same way the ticket chip shows sale state: a glyph and
 * a word alongside the ink, never the ink alone.
 *
 * Draft versus published is the difference between an event that is selling and
 * one that is not, and an operator who cannot distinguish two greens is exactly
 * the person who must not have to.
 */
const statusChip = {
  draft: { icon: PencilSimple, className: "text-muted-foreground" },
  published: { icon: SealCheck, className: "text-healthy-ink" },
  cancelled: { icon: Prohibit, className: "text-destructive-ink" },
} satisfies Record<EventStatus, { icon: typeof SealCheck; className: string }>;

function StatusChip({ status, label }: { status: EventStatus; label: string }) {
  const item = statusChip[status];
  const Icon = item.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${item.className}`}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
