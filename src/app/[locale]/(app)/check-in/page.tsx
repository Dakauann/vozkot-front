import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DoorBoard } from "@/components/admissions/door-board";

/**
 * The door.
 *
 * Deliberately NOT wrapped in the dashboard's usual page chrome of title,
 * description and toolbar. This screen is opened one-handed at an entrance
 * with a queue in front of it, and every row above the scanner is a row the
 * verdict has to be scrolled past. The heading is one line and the rest of the
 * viewport belongs to the answer.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "door" });
  return { title: t("title") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "door" });

  return (
    <div className="space-y-4 pb-10">
      <header className="mx-auto w-full max-w-[560px]">
        <h1 className="font-display text-xl font-semibold tracking-[-0.01em]">{t("title")}</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
      </header>
      <DoorBoard />
    </div>
  );
}
