import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrganiserBalance } from "@/components/payouts/organiser-balance";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("payouts");

  return (
    <main className="w-full">
      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {t("title")}
      </h1>
      <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
      <div className="mt-6">
        <OrganiserBalance />
      </div>
    </main>
  );
}
