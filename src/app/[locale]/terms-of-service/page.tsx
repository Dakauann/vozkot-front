import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Document order, which is also the numbering the anchors carry.
 *
 * Never reorder an existing entry: a clause that changes number between
 * versions is a clause nobody can cite. New sections go at the end of the
 * block they belong to.
 *
 * The order is not arbitrary either. The pre-contractual summary comes first
 * because Decreto 7.962/2013 art. 4, I wants it before contracting rather than
 * after the fine print, and withdrawal sits immediately before cancellation
 * because those are the two sections a buyer arrives looking for.
 */
const SECTIONS = [
  "summary",
  "identification",
  "definitions",
  "acceptance",
  "roles",
  "accounts",
  "organizer",
  "catalogue",
  "purchase",
  "payments",
  // The organiser's side of the money, beside the buyer's.
  "payout",
  "withdrawal",
  "cancellation",
  "meiaEntrada",
  "entry",
  "transfer",
  "acceptableUse",
  "content",
  "notice",
  "integrations",
  "communications",
  "privacy",
  "availability",
  "suspension",
  "liability",
  "support",
  "changes",
  "general",
  "law",
  "contact",
] as const;

const VERSION = "2.1";
const EFFECTIVE_DATE = "2026-09-16";
const LAST_UPDATED = "2026-09-16";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "termsOfService" });
  return { title: t("title"), description: t("metaDescription") };
}

export default async function TermsOfServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The FULL catalogue, on purpose, and only here. A nested provider replaces
  // its parent's messages rather than merging with them, so this one has to
  // carry the shared namespaces too. That is the trade the root layout is
  // making: these two routes ship everything, and every other route on the site
  // stops shipping the legal text it never renders.
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <LegalDocument
        namespace="termsOfService"
        sections={SECTIONS}
        version={VERSION}
        effectiveDate={EFFECTIVE_DATE}
        lastUpdated={LAST_UPDATED}
      />
    </NextIntlClientProvider>
  );
}
