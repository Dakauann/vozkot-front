import { getTranslations } from "next-intl/server";

import { CATEGORY_GLYPHS } from "@/components/icons/category-glyphs";
import { Link } from "@/i18n/routing";
import { EVENT_CATEGORIES, type CatalogueFilters, type EventCategory } from "@/lib/events/types";

/**
 * Ways in, as tiles rather than as a sentence.
 *
 * The pill row this replaces was honest and nearly invisible: eight small
 * outlined chips read as a filter control an expert operates, not as an
 * invitation somebody arriving with no plan accepts. Sympla, Eventbrite and
 * DICE all give this row real estate, and it is among the most-used elements on
 * any of their landing pages.
 *
 * ONE DRAWING PER CATEGORY, and that is the whole condition. This row carried
 * no icons for a good reason: the app's set is a UI set with no trophy, fork,
 * mask or controller in it, so sixteen categories mapped onto it would have put
 * the same unrelated glyph on "Esportivo" and "Saúde e bem estar", which looks
 * decided when it was arbitrary. The objection was to arbitrary icons, not to
 * icons, so the sixteen drawings were made: see icons/category-glyphs.tsx. The
 * NAME still carries the tile; the glyph is the thing the eye lands on first
 * while scanning sideways, and the count is the quiet third line.
 *
 * Only categories that actually have events, biggest first. A shortcut that
 * leads somewhere empty is worse than no shortcut, it teaches people the
 * navigation lies, and they stop trusting the rest of it.
 */
const SHOWN = 10;

export async function CollectionStrip({ filters }: { filters: CatalogueFilters }) {
  const t = await getTranslations("catalogue");
  const tCategory = await getTranslations("categories");

  const counts = new Map(filters.categories.map((option) => [option.value, option.count]));
  const shortcuts = EVENT_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }))
    .filter((option) => option.count > 0)
    .sort((left, right) => right.count - left.count);

  if (shortcuts.length === 0) return null;

  const visible = shortcuts.slice(0, SHOWN);
  const hasMore = shortcuts.length > SHOWN;

  return (
    <section aria-labelledby="collections-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="collections-heading"
          className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {t("browseBy")}
        </h2>
        {hasMore ? (
          <Link
            href="/?view=categories"
            className="shrink-0 rounded-[--radius] text-sm font-medium text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("seeAll")}
          </Link>
        ) : null}
      </div>

      {/* Scrolls sideways on a phone rather than wrapping to five rows, which
          is what turns a glanceable strip into a wall. */}
      <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden">
        {visible.map(({ category, count }) => (
          <li key={category} className="w-[158px] shrink-0 sm:w-[176px]">
            <CollectionTile
              category={category}
              label={tCategory(category)}
              count={count}
              countLabel={t("eventCount", { count })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CollectionTile({
  category,
  label,
  count,
  countLabel,
}: {
  category: EventCategory;
  label: string;
  count: number;
  countLabel: string;
}) {
  const Glyph = CATEGORY_GLYPHS[category];
  return (
    <Link
      href={`/?category=${category}`}
      className="group flex h-full min-h-[104px] flex-col gap-2 rounded-lg border border-border bg-card p-3.5 transition-[border-color,box-shadow] hover:border-primary-edge hover:shadow-[var(--elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
   
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[--radius] text-black dark:text-white transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <Glyph size={20} />
      </span>
      <span className="mt-auto text-sm font-semibold leading-snug text-card-foreground">
        {label}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{countLabel}</span>
      <span className="sr-only">{count}</span>
    </Link>
  );
}
