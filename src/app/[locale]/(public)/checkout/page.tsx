import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CheckoutFlow, type CheckoutPreview } from "@/components/checkout/checkout-flow";
import { coverImage } from "@/components/events/event-image";
import type { Locale } from "@/i18n/config";
import { readIntent } from "@/lib/checkout/intent";
import { getEvent, getEventTiers } from "@/lib/events/api";

/**
 * Checkout.
 *
 * A server component so two things are true before anything renders.
 *
 * The sign-in state is known: a buyer who is already signed in must never see a
 * "sign in first" flash, and one who is not must never be shown a form they
 * cannot submit.
 *
 * And the EVENT is known. The basket in the URL is a list of tier ids, which is
 * all that can safely travel there, but a summary reading "1× Ingresso" beside
 * a blank price is not a summary, it is a loading state pretending to be one.
 * Resolving the poster, the show and the tier names here means the panel is
 * complete in the first paint, while the reservation is still in flight.
 *
 * Everything the buyer chose travels in the query string, which is what lets it
 * survive the sign-in redirect. See lib/checkout/intent.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const t = await getTranslations("checkout");

  // The presence of a session cookie, not its validity. This only decides which
  // of two screens renders first; the API is what actually authenticates, and
  // it answers 401 to a stale cookie whatever was rendered.
  const jar = await cookies();
  const authenticated = jar.has("accessToken") || jar.has("refreshToken");

  const preview = await resolvePreview(search);

  return (
    // 1120px, which fits a form column beside a 360px summary panel without
    // either becoming a stripe. The panel is what keeps what-you-are-buying and
    // what-it-costs on screen through every step.
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="pb-5 font-display text-2xl font-semibold tracking-tight text-foreground">
        {t("title")}
      </h1>
      <CheckoutFlow locale={locale} authenticated={authenticated} preview={preview} />
    </main>
  );
}

/**
 * The chosen basket, resolved into things a person recognises.
 *
 * Best effort throughout: a missing event costs the panel its poster and its
 * tier names, and nothing else. The reservation does not depend on any of it:
 * the server re-reads every tier at checkout and prices the order itself, so a
 * catalogue having a bad moment must not stop somebody buying a ticket.
 */
async function resolvePreview(
  search: Record<string, string | string[] | undefined>,
): Promise<CheckoutPreview | undefined> {
  const intent = readIntent(search);
  const slug = intent?.eventSlug;
  if (!intent || !slug) return undefined;

  const happening = await getEvent(slug);
  if (!happening) return undefined;
  const tiers = await getEventTiers(happening.id);
  const byID = new Map(tiers.map((tier) => [tier.id, tier]));

  return {
    event: {
      slug: happening.slug,
      name: happening.name,
      startsAt: happening.startsAt,
      venue: happening.location.venue,
      city: happening.location.city,
      uf: happening.location.uf,
      cover: coverImage(happening.media),
    },
    lines: intent.lines.map((line) => {
      const tier = byID.get(line.ticketId);
      return {
        ticketId: line.ticketId,
        quantity: line.quantity,
        title: tier?.title ?? "",
        // Indicative only, and labelled as such on screen. The order's own
        // total, once it exists, is the number that is charged.
        unitPriceCents: tier?.priceCents,
        currency: tier?.currency ?? "BRL",
      };
    }),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  // A checkout page has no business in a search index.
  return { title: t("title"), robots: { index: false, follow: false } };
}
