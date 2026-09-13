"use client";

import { useLocale, useTranslations } from "next-intl";
import * as React from "react";

import { CaretDown, Check, CircleNotch } from "@/components/icons";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Locale } from "@/i18n/config";
import { getOwnEvent, listOwnEvents } from "@/lib/events/admin-api";
import type { EventListing, EventSummary } from "@/lib/events/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Picking the event a tier belongs to.
 *
 * A native `<select>` is the wrong control here and gets more wrong over time:
 * it renders every option the browser is given, which means the page has to
 * load every event an organiser has ever created before it can offer any of
 * them, and once there are more than a screenful the only way to find one is to
 * scroll. An organiser with four hundred events gets a four-hundred-row menu.
 *
 * So the list is searched and paged on the SERVER — the same full-text search
 * the public catalogue uses — and the control holds one page at a time. Typing
 * narrows it; reaching the bottom asks for more.
 *
 * Search is debounced and every request is abortable, because a person typing
 * "festival" fires eight searches and only the last one matters.
 */

/** One page inside the popover. Small: this is a list someone reads, not scans. */
const PAGE_SIZE = 20;

/** Long enough that a typist does not outrun it, short enough to feel live. */
const DEBOUNCE_MS = 250;

export function EventCombobox({
  value,
  onChange,
  id,
  disabled = false,
  invalid = false,
}: {
  /** The selected event id, or "" for none. */
  value: string;
  onChange: (eventId: string) => void;
  id: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("eventAdmin");
  const locale = useLocale() as Locale;

  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");
  const [items, setItems] = React.useState<EventListing[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [paging, setPaging] = React.useState(false);

  /**
   * The chosen event, kept even when it is not in the current page of results.
   *
   * Without this the trigger would go blank the moment somebody typed a search
   * that excludes their own selection — the value is still set, so a blank
   * label would be a lie about the form's state.
   */
  const [selected, setSelected] = React.useState<EventSummary | EventListing | null>(null);

  // Derived, not stored: with no value there is nothing selected, whatever the
  // last selection was. Clearing it from inside the effect would set state
  // during the effect body every time the field was emptied.
  const shown = value === "" ? null : selected;

  React.useEffect(() => {
    if (value === "") return;
    if (selected?.id === value) return;

    let active = true;
    void (async () => {
      const known = items.find((item) => item.id === value);
      if (known) {
        if (active) setSelected(known);
        return;
      }
      // Not in the list: this is an edit screen that opened with a value and
      // has not searched yet. One request for the one event.
      const result = await getOwnEvent(value);
      if (active && result.data) setSelected(result.data);
    })();
    return () => {
      active = false;
    };
    // `items` is deliberately absent: it changes on every search, and re-running
    // this on each keystroke would re-fetch the selection needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selected?.id]);

  // The search itself. Only runs while the popover is open, because a closed
  // combobox has nobody reading its results.
  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const result = await listOwnEvents({ q: term || undefined, limit: PAGE_SIZE, offset: 0 });
      if (controller.signal.aborted) return;

      setLoading(false);
      setItems(result.data?.data ?? []);
      setTotal(result.data?.total ?? 0);
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, open]);

  const loadMore = React.useCallback(async () => {
    setPaging(true);
    const result = await listOwnEvents({
      q: term || undefined,
      limit: PAGE_SIZE,
      offset: items.length,
    });
    setPaging(false);
    if (!result.data) return;
    // Appended, and de-duplicated by id: two pages can overlap if an event is
    // created between the requests, and a repeated React key is a crash.
    setItems((current) => {
      const seen = new Set(current.map((item) => item.id));
      return [...current, ...result.data!.data.filter((item) => !seen.has(item.id))];
    });
    setTotal(result.data.total);
  }, [items.length, term]);

  const label = shown?.name ?? t("form.pickEvent");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          // No explicit role: Radix's trigger already announces the popup and
          // its expanded state, and a bare role="combobox" without the
          // aria-controls that a real one needs is worse than no role at all.
          // The error is announced by pointing at the message Field renders,
          // since aria-invalid means nothing on a button.
          aria-describedby={invalid ? `${id}-error` : undefined}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-[--radius] border bg-background px-3 text-left text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
            invalid ? "border-destructive" : "border-input",
            shown ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">{label}</span>
          <CaretDown size={14} aria-hidden className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        // The list is long and scrolls; letting the popover size itself to the
        // trigger keeps it from jumping about as results change.
      >
        {/* shouldFilter off: the server already decided what matches. Letting
            cmdk filter again would hide rows the search deliberately returned,
            such as a match on the venue rather than on the name. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder={t("searchPlaceholder")}
          />
          <CommandList className="max-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <CircleNotch size={14} className="animate-spin" aria-hidden />
                {t("loading")}
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>{t("empty")}</CommandEmpty>
            ) : (
              <>
                {items.map((event) => (
                  <CommandItem
                    key={event.id}
                    value={event.id}
                    onSelect={() => {
                      onChange(event.id);
                      setSelected(event);
                      setOpen(false);
                    }}
                    className="flex items-start gap-2"
                  >
                    <Check
                      size={14}
                      aria-hidden
                      className={cn(
                        "mt-0.5 shrink-0",
                        event.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{event.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDateTime(event.startsAt, locale)}
                        {event.location.venue ? ` · ${event.location.venue}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t(`status.${event.status}`)}
                    </span>
                  </CommandItem>
                ))}

                {items.length < total ? (
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={paging}
                      className="flex h-8 w-full items-center justify-center gap-2 rounded-[--radius] text-xs font-medium text-muted-foreground transition-colors hover:bg-accent-hover hover:text-foreground disabled:opacity-60"
                    >
                      {paging ? <CircleNotch size={12} className="animate-spin" aria-hidden /> : null}
                      {t("loadMore", { shown: items.length, total })}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
