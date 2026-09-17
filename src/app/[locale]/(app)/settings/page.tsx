import { setRequestLocale } from "next-intl/server";

import { AudienceSettings } from "@/components/auth/audience-settings";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { Gear } from "@/components/icons";
import { getTranslations } from "next-intl/server";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("scaffold");

  return (
    <div className="mx-auto max-w-[1600px]">
      <DashboardPageHeader
        icon={<Gear weight="regular" />}
        title={t("settings.title")}
        description={t("settings.description")}
      />
      {/* The one part of settings that is real: the optional answers a buyer
          gave at sign-up, editable afterwards. Everything else on this route is
          still the starter's scaffold — the block below renders nothing at all
          for an account that has not completed its identity block, so a fresh
          workspace still sees the placeholder rather than an empty form. */}
      <div className="mt-6">
        <AudienceSettings />
      </div>
      <div className="mt-6 rounded-[--radius] border border-dashed border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-foreground">{t("title")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t("body")}
        </p>
      </div>
    </div>
  );
}
