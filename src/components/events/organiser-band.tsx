import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";

/**
 * The one place on the buyer's page that talks to organisers.
 *
 * A mid-page band rather than a header link, which is where Sympla puts the
 * same message on its city pages. Somebody who has scrolled the whole landing
 * page has seen what the platform does with an event, and that is the moment
 * the offer to list one lands — far better than a link in the chrome that
 * competes with "sign in" before anyone knows what the site is.
 *
 * One band, two links, no illustration. It is a footnote to a buyer's page, not
 * a second landing page embedded in the first.
 */
export async function OrganiserBand() {
  const t = await getTranslations("organiserBand");

  return (
    <section className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold tracking-tight text-card-foreground">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
          {t("body")}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <Link
          href="/events/new"
          className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--elev-button-primary)] transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("create")}
        </Link>
        <Link
          href="/help"
          className="inline-flex h-10 items-center rounded-md border border-border-strong bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("how")}
        </Link>
      </div>
    </section>
  );
}
