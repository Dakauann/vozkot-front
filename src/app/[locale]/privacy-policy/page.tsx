import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { getTranslations, setRequestLocale } from "next-intl/server";

const SECTIONS = [
  "scope",
  "roles",
  "data",
  "collection",
  "purposes",
  "bases",
  "integrations",
  "communications",
  "sharing",
  "transfers",
  "cookies",
  "retention",
  "security",
  "rights",
  "organizerData",
  "children",
  "incidents",
  "changes",
  "contact",
] as const;

const LAST_UPDATED = "2026-09-13";

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
  return (
    <LegalDocument
      namespace="privacyPolicy"
      sections={SECTIONS}
      version="1.0"
      lastUpdated={LAST_UPDATED}
    />
  );
}
