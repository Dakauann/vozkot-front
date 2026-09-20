import { setRequestLocale } from "next-intl/server";

import { AudienceSettings } from "@/components/auth/audience-settings";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { InDevelopment } from "@/components/dashboard/scaffold-page";
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
      {/* The one part of settings that is built: the optional answers a buyer
          gave, editable afterwards. It renders nothing at all for an account
          with no identity block yet, so a fresh one sees only the notice. */}
      <div className="mt-6">
        <AudienceSettings />
      </div>
      <InDevelopment className="mt-6" />
    </div>
  );
}
