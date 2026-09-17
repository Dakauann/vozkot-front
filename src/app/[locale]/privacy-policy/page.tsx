import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Document order, which is also the numbering the anchors carry.
 *
 * Never reorder an existing entry: support macros, procurement redlines and
 * the organizer's own notice all deep-link to `#retention` and `#rights`, and
 * a clause that changes number between versions is a clause nobody can cite.
 * New sections go at the end of the block they belong to.
 */
const SECTIONS = [
  "summary",
  "controller",
  "roles",
  "data",
  "sensitive",
  "sources",
  "cookies",
  "browserCalls",
  "bases",
  "sharing",
  "transfers",
  "retention",
  "security",
  "incidents",
  "automated",
  "rights",
  "communications",
  "children",
  "organizerData",
  "photography",
  "regional",
  "changes",
  "contact",
] as const;

const VERSION = "2.0";
const EFFECTIVE_DATE = "2026-09-16";
const LAST_UPDATED = "2026-09-16";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacyPolicy" });
  return { title: t("title"), description: t("metaDescription") };
}

export default async function PrivacyPolicyPage({
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
        namespace="privacyPolicy"
        sections={SECTIONS}
        version={VERSION}
        effectiveDate={EFFECTIVE_DATE}
        lastUpdated={LAST_UPDATED}
      />
    </NextIntlClientProvider>
  );
}
