"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import ElevatedInput from "@/components/elevated-design/elevated-input";
import { CircleNotch, MagnifyingGlass, MapPin } from "@/components/icons";
import {
  MIN_SEARCH_LENGTH,
  searchAddresses,
  type AddressSuggestion,
} from "@/lib/events/geocode";
import { cn } from "@/lib/utils";

/**
 * Finding a venue by typing its name or its street.
 *
 * This is the control an operator reaches for first, and until now it did not
 * exist: the form could only be driven by a CEP, which is the one part of an
 * address most people have to go and look up. Worse, a CEP is a block in a
 * dense city and a whole district in a small town, so even a correct one drops
 * the pin somewhere near the venue rather than on it.
 *
 * So: type "Espaço Aurora" or "Rua Harmonia 150 Vila Madalena", pick from the
 * list, and the address fields and the pin are filled together. The pin stays
 * draggable afterwards, because a geocoder returns a building's centroid and
 * the door, which is what a buyer walks to, is on one side of it. Search to
 * get close, drag to be right: the order every maps application has taught.
 *
 * The list is a real ARIA combobox rather than a div that looks like one:
 * arrows move through it, Enter takes the active option, Escape closes it, and
 * `aria-activedescendant` is what tells a screen reader which row moved under
 * the cursor while focus stays in the text box.
 */

/** Long enough that a typist does not outrun it, short enough to feel live. */
const DEBOUNCE_MS = 300;

export function AddressSearch({
  id,
  onPick,
  disabled = false,
}: {
  id: string;
  /** Fired with the chosen place. The form decides which fields it overwrites. */
  onPick: (suggestion: AddressSuggestion) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("eventAdmin");

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  /**
   * The query the results in hand actually answer.
   *
   * A flag would do for "a search has come back", and it would be wrong for one
   * keystroke: results for "rua harm" are still on screen while "rua harmo" is
   * being searched, and a bare flag cannot tell "no matches" from "not asked
   * yet about THIS". Keeping the query means the empty state is only ever said
   * about a search that ran and returned nothing.
   */
  const [answeredFor, setAnsweredFor] = React.useState("");
  /** Closed by the operator: Escape, a click away, or taking a result. */
  const [dismissed, setDismissed] = React.useState(true);

  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_SEARCH_LENGTH;

  // Derived, never stored. Storing `open` would mean writing it from the effect
  // below on the keystroke that drops the query under three characters, which
  // is a setState in an effect body and a second render for something already
  // knowable from what is on screen.
  const open = !dismissed && !tooShort && (results.length > 0 || answeredFor === trimmed);
  const empty = open && !searching && answeredFor === trimmed && results.length === 0;

  const listId = `${id}-results`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Suppresses the search that picking a result would otherwise trigger: the
  // chosen address goes into the box, which changes the query, which would
  // search for the thing just chosen and reopen the list over the form the
  // operator has moved on to.
  const skipNext = React.useRef(false);

  React.useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (tooShort) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchAddresses(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      setAnsweredFor(trimmed);
      setActive(found.length > 0 ? 0 : -1);
      setSearching(false);
      setDismissed(false);
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, tooShort]);

  // Clicking anywhere else closes the list. A dropdown that survives a click on
  // the field below it covers the thing the operator just moved to.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setDismissed(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (suggestion: AddressSuggestion) => {
    skipNext.current = true;
    setQuery(describe(suggestion));
    setDismissed(true);
    setActive(-1);
    onPick(suggestion);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setDismissed(true);
      return;
    }
    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // The arrows belong to the list here, not to the caret in the text box.
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + results.length) % results.length);
      return;
    }
    if (event.key === "Enter" && active >= 0) {
      // Otherwise this submits the event form, from a keystroke the operator
      // meant for the list.
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <ElevatedInput
        id={id}
        type="search"
        label={t("search.label")}
        hint={t("search.hint")}
        icon={<MagnifyingGlass size={16} aria-hidden />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setDismissed(false)}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
      />

      {searching && !tooShort ? (
        <CircleNotch
          size={14}
          aria-hidden
          className="absolute right-3 top-[1.125rem] animate-spin text-muted-foreground"
        />
      ) : null}

      {open ? (
        // Above the fields under it, and above the map further down, which
        // creates its own stacking context around the MapLibre canvas.
        <div className="absolute inset-x-0 top-[calc(100%-1.25rem)] z-30 overflow-hidden rounded-[--radius] border border-control-edge bg-card shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label={t("search.label")}
            className="max-h-72 overflow-y-auto py-1"
          >
            {results.map((suggestion, index) => (
              <li key={suggestion.id}>
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  // pointerdown, not click: the outside-click handler above runs
                  // on pointerdown and would close the list before a click ever
                  // landed on the row under the finger.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    choose(suggestion);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    index === active ? "bg-accent-hover" : "bg-transparent",
                  )}
                >
                  <MapPin size={14} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {suggestion.name || suggestion.street || suggestion.city}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {secondary(suggestion)}
                    </span>
                  </span>
                </button>
              </li>
            ))}

            {empty ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground" role="status">
                {t("search.empty")}
              </li>
            ) : null}
          </ul>

          {/* ODbL requires the source to be named wherever its data is shown,
              and a geocoder's results are its data. */}
          <p className="border-t border-border px-3 py-1.5 text-[0.6875rem] text-muted-foreground">
            {t("search.attribution")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** What goes back into the box once a result is taken: the whole address. */
function describe(suggestion: AddressSuggestion): string {
  const head =
    suggestion.name && suggestion.street
      ? `${suggestion.name}, ${suggestion.street}`
      : suggestion.name || suggestion.street;
  return [head, suggestion.neighborhood, place(suggestion)].filter(Boolean).join(", ");
}

/** The line under the name: everything that says WHICH one of these it is. */
function secondary(suggestion: AddressSuggestion): string {
  const parts = suggestion.name ? [suggestion.street] : [];
  parts.push(suggestion.neighborhood, place(suggestion), suggestion.postalCode);
  return parts.filter(Boolean).join(" · ");
}

function place(suggestion: AddressSuggestion): string {
  if (!suggestion.city) return suggestion.uf;
  return suggestion.uf ? `${suggestion.city} - ${suggestion.uf}` : suggestion.city;
}
