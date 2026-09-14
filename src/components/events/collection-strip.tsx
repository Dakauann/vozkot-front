import { getTranslations } from "next-intl/server";

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
 * No icons, deliberately. Sixteen categories mapped onto a generic icon set
 * produces a row where "Esportivo" and "Saúde e bem-estar" wear the same
 * unrelated glyph, which is worse than no glyph: it looks decided when it was
 * arbitrary. The category NAME is the affordance, sized to be read at a glance,
 * with its real count underneath.
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
          <li key={category} className="w-[150px] shrink-0 sm:w-[168px]">
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
  return (
    <Link
      href={`/?category=${category}`}
      className="flex h-full min-h-[76px] flex-col justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary-edge hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="text-sm font-semibold leading-snug text-card-foreground">{label}</span>
      <span className="mt-2 text-xs tabular-nums text-muted-foreground">{countLabel}</span>
      <span className="sr-only">{count}</span>
    </Link>
  );
}
