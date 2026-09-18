import { setRequestLocale } from "next-intl/server";

import { PlanLibrary } from "@/components/seating/plan-library";

/**
 * The plan library.
 *
 * This route used to be the builder itself, which meant opening "Plantas"
 * dropped an organiser onto a full-bleed canvas that then had to ask, in two
 * `sr-only`-labelled dropdowns, which venue and which plan they meant. The
 * first thing the feature ever said was "choose two things you have not created
 * yet", and somebody with four rooms had no way to see what they had.
 *
 * The library answers what the page is actually opened with: what rooms do I
 * have, and what is in them, and editing is a deliberate step behind a button,
 * at /venues/{id}.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlanLibrary />;
}
