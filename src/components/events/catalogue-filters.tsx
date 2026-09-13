"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";

import { patchParams } from "@/lib/events/query";
import { EVENT_CATEGORIES, type CatalogueFilters as Options } from "@/lib/events/types";

/**
 * The filter row.
 *
 * A row of chips rather than a sidebar, and the choice is not cosmetic: a
 * sidebar costs a column that a phone does not have, so a sidebar design needs
 * a second mobile design. One row that scrolls horizontally is the same control
 * at every width.
 *
 * Every filter is a URL parameter, which is what makes a filtered catalogue
 * shareable, bookmarkable and back-button-able. Holding this in React state
 * instead would give all three of those up.
 */
export function CatalogueFilters({ options }: { options: Options }) {
  const t = useTranslations("catalogue");
  // Category names are domain vocabulary, not page copy: one namespace, read
  // here and on the event page, so a rename never has to happen twice.
  const tCategory = useTranslations("categories");
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      // patchParams resets the page for us: any change to the filter means the
      // page numbers no longer refer to the same set, and staying on page 7 of
      // a filter that now matches four events shows an empty page with no way
      // back.
      const next = patchParams(params, changes);
      startTransition(() => {
        router.push(next.size > 0 ? `?${next.toString()}` : "?", { scroll: false });
      });
    },
    [params, router],
  );

  const active = {
    category: params.get("category") ?? "",
    city: params.get("city") ?? "",
    sort: params.get("sort") ?? "",
    free: params.get("free") === "true",
    available: params.get("available") === "true",
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: query.trim() || null });
      }}
      aria-busy={pending}
    >
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="catalogue-search">
          {t("searchLabel")}
        </label>
        <input
          id="catalogue-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("search")}
        </button>
      </div>

      {/* Horizontally scrollable on a phone, wrapped on a desktop. The
          scrollbar is hidden because the chips themselves are the affordance. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        <Select
          label={t("category")}
          value={active.category}
          onChange={(value) => apply({ category: value })}
          options={[
            { value: "", label: t("allCategories") },
            ...EVENT_CATEGORIES.map((category) => {
              const found = options.categories.find((option) => option.value === category);
              return {
                value: category,
                label: tCategory(category),
                // Greyed out rather than hidden: a filter row whose options
                // come and go as events are published is one nobody can learn.
                disabled: (found?.count ?? 0) === 0,
                count: found?.count ?? 0,
              };
            }),
          ]}
        />

        <Select
          label={t("city")}
          value={active.city}
          onChange={(value) => apply({ city: value })}
          options={[
            { value: "", label: t("allCities") },
            ...options.cities.map((city) => ({
              value: city.city,
              label: city.uf ? `${city.city} · ${city.uf}` : city.city,
              count: city.count,
            })),
          ]}
        />

        <Select
          label={t("sortBy")}
          value={active.sort}
          onChange={(value) => apply({ sort: value })}
          options={[
            { value: "", label: t("sortSoonest") },
            { value: "price", label: t("sortPrice") },
            { value: "relevance", label: t("sortRelevance") },
          ]}
        />

        <Toggle
          label={t("onlyFree")}
          pressed={active.free}
          onChange={(pressed) => apply({ free: pressed ? "true" : null })}
        />
        <Toggle
          label={t("onlyAvailable")}
          pressed={active.available}
          onChange={(pressed) => apply({ available: pressed ? "true" : null })}
        />

        {hasAnyFilter(params) ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              startTransition(() => router.push("?", { scroll: false }));
            }}
            className="h-9 shrink-0 rounded-full border border-border-strong px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("clearFilters")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function hasAnyFilter(params: URLSearchParams): boolean {
  return ["q", "category", "city", "sort", "free", "available"].some((key) => params.get(key));
}

/**
 * A native select behind a chip.
 *
 * Native, deliberately: it is keyboard-accessible, screen-reader-correct and
 * renders as the platform's own picker on a phone, all of which a custom
 * dropdown has to reimplement and usually gets wrong.
 */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean; count?: number }[];
}) {
  const chosen = value !== "";
  return (
    <label
      className={`relative inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm transition-colors ${
        chosen
          ? "border-primary-edge bg-primary text-primary-foreground"
          : "border-border-strong bg-background text-foreground hover:bg-accent-hover"
      }`}
    >
      <span className="pointer-events-none pr-1 font-medium">
        {chosen ? options.find((option) => option.value === value)?.label ?? label : label}
      </span>
      <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none h-3 w-3 opacity-60">
        <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.count !== undefined && option.value !== ""
              ? `${option.label} (${option.count})`
              : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  pressed,
  onChange,
}: {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        pressed
          ? "border-primary-edge bg-primary text-primary-foreground"
          : "border-border-strong bg-background text-foreground hover:bg-accent-hover"
      }`}
    >
      {label}
    </button>
  );
}
