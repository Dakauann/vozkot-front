import { Gear } from "@/components/icons";
import { ScaffoldPage } from "@/components/dashboard/scaffold-page";
import { setRequestLocale } from "next-intl/server";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ScaffoldPage icon={<Gear weight="regular" />} messageKey="settings" />;
}
