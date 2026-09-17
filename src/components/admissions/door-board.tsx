"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { CalendarBlank, CircleNotch, MagnifyingGlass } from "@/components/icons";
import ElevatedInput from "@/components/elevated-design/elevated-input";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatLongDateTime } from "@/lib/format";
import { listOwnEvents } from "@/lib/events/admin-api";
import { cn } from "@/lib/utils";
import type { EventListing } from "@/lib/events/types";

import { DoorScanner } from "./door-scanner";

/**
 * The door, plus the one decision it needs made first.
 *
 * A code is only valid at ONE event, so a scanner that does not know which
 * door it is standing at cannot answer anything.
 *
 * The picker is SERVER-PAGINATED AND SEARCHED, not a dump of everything. An
 * operator with sixty published events was handed sixty rows to scroll past
 * before they could scan anything, which is the wrong trade twice over: it is
 * unusable at a door, and it does not survive the operator who has six
 * hundred. The search goes to the server's own `q`, the same index the
 * catalogue uses, so three letters of a festival's name cost one indexed query
 * rather than a full page filtered in the browser.
 *
 * The chosen event is remembered in the URL hash, so a phone that locks and
 * reopens, or a browser that reloads on a flaky connection, comes back to the
 * same door instead of to the picker.
 */

/** Small, because this list is read on a phone with a queue in front of it. */
const PAGE_SIZE = 8;
/** Long enough that typing a word is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

export function DoorBoard() {
  const t = useTranslations("door");
  const locale = useLocale() as Locale;

  const [selected, setSelected] = React.useState<EventListing | null>(null);
  // Read in the initialiser, not in an effect: whether a door was remembered
  // is knowable on the first render, and resolving it from an effect would
  // flash the picker at somebody who already chose.
  const [remembered] = React.useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, ""),
  );
  const [resolving, setResolving] = React.useState(() => remembered !== "");

  // A door remembered in the hash is resolved by id, not by hunting for it in
  // a page of results that may not contain it.
  React.useEffect(() => {
    if (remembered === "") return;
    let live = true;
    listOwnEvents({ limit: PAGE_SIZE, offset: 0, q: remembered }).then((result) => {
      if (!live) return;
      const match = (result.data?.data ?? []).find((item) => item.id === remembered);
      if (match) setSelected(match);
      setResolving(false);
    });
    return () => {
      live = false;
    };
  }, [remembered]);

  const remember = (id: string) => {
    window.history.replaceState(
      null,
      "",
      id === "" ? window.location.pathname : `#${id}`,
    );
  };

  const choose = (item: EventListing) => {
    setSelected(item);
    remember(item.id);
  };

  if (resolving) {
    return (
      <p
        className="mx-auto flex w-full max-w-[560px] items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
        {t("loadingEvents")}
      </p>
    );
  }

  if (!selected) {
    return <EventPicker onPick={choose} />;
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          {formatLongDateTime(selected.startsAt, locale)}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            setSelected(null);
            remember("");
          }}
          className="shrink-0"
        >
          {t("changeEvent")}
        </Button>
      </div>

      <DoorScanner eventId={selected.id} eventName={selected.name} />
    </div>
  );
}

function EventPicker({ onPick }: { onPick: (item: EventListing) => void }) {
  const t = useTranslations("door");
  const locale = useLocale() as Locale;

  const [term, setTerm] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const [page, setPage] = React.useState<{ items: EventListing[]; total: number } | null>(null);
  const [loading, setLoading] = React.useState(false);

  // The generation counter is what stops a slow earlier response from
  // overwriting a faster later one, which is the bug every debounced search
  // has until it does not.
  const generation = React.useRef(0);

  React.useEffect(() => {
    const mine = ++generation.current;
    const query = term.trim();
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        listOwnEvents({
          limit: PAGE_SIZE,
          offset,
          q: query === "" ? undefined : query,
          sort: "starts_at",
        }).then((result) => {
          if (mine !== generation.current) return;
          // Published only: a draft has sold nothing, so its door has nothing
          // to scan, and offering it is an invitation to stand at the wrong
          // one. Filtered here because the operator listing takes no status
          // parameter.
          setPage({
            items: (result.data?.data ?? []).filter((item) => item.status === "published"),
            total: result.data?.total ?? 0,
          });
          setLoading(false);
        });
      },
      // No wait on a page change: the operator pressed a button and expects
      // movement. The debounce is for typing only.
      query === "" ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [term, offset]);

  const total = page?.total ?? 0;
  const showing = page?.items ?? [];
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold tracking-[-0.01em]">
          {t("pickTitle")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("pickHint")}</p>
      </div>

      {/* The same search control the ticket catalogue's toolbar uses, one size
          up because this one is tapped on a phone rather than a desk. */}
      <ElevatedInput
        variant="search"
        controlSize="lg"
        icon={<MagnifyingGlass size={16} aria-hidden />}
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOffset(0);
        }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        autoComplete="off"
      />

      {page === null ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
          <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
          {t("loadingEvents")}
        </p>
      ) : showing.length === 0 ? (
        <div className="rounded-[--radius] border border-border bg-card px-5 py-8 text-center">
          <CalendarBlank className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-display text-base font-semibold text-foreground">
            {term.trim() === "" ? t("noEventsTitle") : t("noMatchTitle")}
          </p>
          <p className="mx-auto mt-1 max-w-[42ch] text-sm leading-6 text-muted-foreground">
            {term.trim() === "" ? t("noEventsBody") : t("noMatchBody")}
          </p>
        </div>
      ) : (
        <>
          {/* One card, rows divided inside it: the same shape the ticket
              catalogue's list uses, so a picker does not read as a second
              kind of list. */}
          <div
            className={cn(
              "overflow-hidden rounded-[--radius] border border-border bg-card transition-opacity",
              loading && "opacity-60",
            )}
          >
            <ul className="divide-y divide-border">
              {showing.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {formatLongDateTime(item.startsAt, locale)}
                      {item.location?.city ? ` · ${item.location.city}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("range", { from, to, total })}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  {t("previous")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={to >= total || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
