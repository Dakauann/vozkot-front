import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { getCatalogueFilters } from "@/lib/events/api";
import { EVENT_CATEGORIES } from "@/lib/events/types";

/**
 * The links above the footer.
 *
 * This is a search surface as much as a navigation one. Every marketplace of
 * this kind carries the same block, Sympla lists twelve cities and thirteen
 * categories down there, because it is what gives a crawler a path into the
 * long tail of city and category pages that would otherwise only be reachable
 * by typing a query. Those landing pages are where most organic ticket traffic
 * actually arrives.
 *
 * Built from what is really in the catalogue, biggest first, so it never offers
 * a route to an empty page.
 */

/** Enough to be a map, not so many it becomes a wall of grey text. */
const CITIES = 12;
const CATEGORIES = 12;

export async function CatalogueFooterNav() {
  const [t, tCategory, filters] = await Promise.all([
    getTranslations("catalogue"),
    getTranslations("categories"),
    getCatalogueFilters(),
  ]);

  const cities = [...filters.cities]
    .filter((option) => option.count > 0 && option.city.trim() !== "")
    .sort((left, right) => right.count - left.count)
    .slice(0, CITIES);

  const counts = new Map(filters.categories.map((option) => [option.value, option.count]));
  const categories = EVENT_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }))
    .filter((option) => option.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, CATEGORIES);

  // Nothing published yet. An empty catalogue should not render two empty
  // headings above the footer.
  if (cities.length === 0 && categories.length === 0) return null;

  return (
    <nav
      aria-label={t("browseBy")}
      className="border-t border-border bg-background"
    >
      <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:px-8">
        {cities.length > 0 ? (
          <Column title={t("byCity")}>
            {cities.map((option) => (
              <FooterLink
                key={`${option.city}-${option.uf}`}
                href={`/?city=${encodeURIComponent(option.city)}`}
              >
                {option.city}
                {option.uf ? `, ${option.uf}` : ""}
              </FooterLink>
            ))}
          </Column>
        ) : null}

        {categories.length > 0 ? (
          <Column title={t("byCategory")}>
            {categories.map(({ category }) => (
              <FooterLink key={category} href={`/?category=${category}`}>
                {tCategory(category)}
              </FooterLink>
            ))}
          </Column>
        ) : null}
      </div>
    </nav>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
      {/* Two or three columns of links rather than one long ladder, which is
          what keeps a twelve-item list to four lines instead of twelve. */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="block truncate rounded-[--radius] text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </Link>
    </li>
  );
}
