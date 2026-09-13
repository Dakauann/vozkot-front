import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

const SECTIONS = [
  "acceptance",
  "scope",
  "accounts",
  "organizer",
  "sales",
  "payments",
  "integrations",
  "communications",
  "acceptableUse",
  "content",
  "privacy",
  "availability",
  "suspension",
  "warranties",
  "liability",
  "changes",
  "law",
  "contact",
] as const;

const LAST_UPDATED = "2026-09-13";

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
  // stops shipping ~22 KB of legal text it never renders.
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
    <LegalDocument
      namespace="termsOfService"
      sections={SECTIONS}
      version="1.0"
      lastUpdated={LAST_UPDATED}
    />
    </NextIntlClientProvider>
  );
}
