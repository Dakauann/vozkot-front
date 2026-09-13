import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { currentPage, pageCount, windowed } from "@/lib/events/pagination";
import { patchParams, toPairs, type SearchParams } from "@/lib/events/query";
import { MAX_OFFSET } from "@/lib/events/types";

/**
 * Numbered pagination over a windowed range.
 *
 * Numbers rather than infinite scroll, for three reasons that all show up in a
 * catalogue: a page number is a place a person can return to and share, a
 * footer is reachable without loading everything above it, and a crawler can
 * follow links it cannot scroll to.
 *
 * Real `<a>` elements, so middle-click, open-in-new-tab and the back button all
 * behave. A button that pushes history does none of those.
 */
export async function Pagination({
  total,
  limit,
  offset,
  searchParams,
  maxOffset = MAX_OFFSET,
}: {
  total: number;
  limit: number;
  offset: number;
  /** Everything currently in the URL, so a page link keeps the filters. */
  searchParams: SearchParams;
  maxOffset?: number;
}) {
  const t = await getTranslations("catalogue");
  const pages = pageCount(total, limit, maxOffset);
  const current = currentPage(offset, limit);

  if (pages <= 1) return null;

  // Page one is the bare address, with no `page=1` on it. One page, one URL:
  // otherwise the first page is reachable under two spellings, which splits its
  // cache entry and hands search engines a duplicate to pick between.
  const href = (page: number) => {
    const next = patchParams(new URLSearchParams(toPairs(searchParams)), {
      page: page > 1 ? String(page) : null,
    });
    // The catalogue is the site root now, so page two of it is "/?page=2".
    return next.size > 0 ? `/?${next.toString()}` : "/";
  };

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 pt-2" aria-label={t("pagination")}>
      <PageLink href={href(current - 1)} disabled={current === 1} label={t("previous")}>
        ‹
      </PageLink>

      {windowed(current, pages).map((page, index) =>
        page === null ? (
          <span key={`gap-${index}`} className="px-1.5 text-sm text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <PageLink
            key={page}
            href={href(page)}
            current={page === current}
            label={t("goToPage", { page })}
          >
            {page}
          </PageLink>
        ),
      )}

      <PageLink href={href(current + 1)} disabled={current === pages} label={t("next")}>
        ›
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  current = false,
  disabled = false,
  label,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const shared =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  if (disabled) {
    // A span, not a disabled link: there is no such thing, and an <a> with no
    // href is skipped by keyboard navigation rather than announced as unusable.
    return (
      <span aria-hidden className={`${shared} border-border text-muted-foreground opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={`${shared} ${
        current
          ? "border-primary-edge bg-primary font-semibold text-primary-foreground"
          : "border-border-strong bg-background text-foreground hover:bg-accent-hover"
      }`}
    >
      {children}
    </Link>
  );
}
