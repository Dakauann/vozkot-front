import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { getTranslations, setRequestLocale } from "next-intl/server";

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
  return (
    <LegalDocument
      namespace="termsOfService"
      sections={SECTIONS}
      version="1.0"
      lastUpdated={LAST_UPDATED}
    />
  );
}
